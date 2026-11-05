#!/usr/bin/env python3
"""
Higgsfield MCP Client (`https://mcp.higgsfield.ai/mcp`)
- Supports OAuth 2.1 Dynamic Client Registration + PKCE Browser Login (`oauth2/register` -> `oauth2/authorize` -> `oauth2/token`).
- Stores token state locally in `.mcp_token.json` (gitignored, never printed or logged).
- Speaks MCP Streamable HTTP (`initialize`, `tools/list`, `tools/call`) against `https://mcp.higgsfield.ai/mcp`.
"""

from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import secrets
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

BASE_DIR = Path(__file__).resolve().parent
TOKEN_FILE = BASE_DIR / ".mcp_token.json"
MCP_ENDPOINT = "https://mcp.higgsfield.ai/mcp"
OAUTH_REGISTER_URL = "https://mcp.higgsfield.ai/oauth2/register"
OAUTH_AUTHORIZE_URL = "https://mcp.higgsfield.ai/oauth2/authorize"
OAUTH_TOKEN_URL = "https://mcp.higgsfield.ai/oauth2/token"
CALLBACK_PORT = 8912
REDIRECT_URI = f"http://127.0.0.1:{CALLBACK_PORT}/callback"


def _load_saved_auth() -> Optional[Dict[str, Any]]:
    if not TOKEN_FILE.exists():
        return None
    try:
        return json.loads(TOKEN_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_auth(data: Dict[str, Any]) -> None:
    TOKEN_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    os.chmod(TOKEN_FILE, 0o600)


def ensure_mcp_access_token(interactive_login: bool = True) -> str:
    """
    Returns a valid OAuth access token for `https://mcp.higgsfield.ai/mcp`.
    Refreshes automatically if a refresh_token is available, or launches the
    1-click browser OAuth 2.1 PKCE login flow if needed.
    """
    saved = _load_saved_auth() or {}
    now = time.time()

    if saved.get("access_token") and saved.get("expires_at", 0) > now + 60:
        return str(saved["access_token"])

    # Try refresh_token if present
    if saved.get("refresh_token") and saved.get("client_id"):
        try:
            with httpx.Client(timeout=15.0) as client:
                r = client.post(
                    OAUTH_TOKEN_URL,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": saved["refresh_token"],
                        "client_id": saved["client_id"],
                    },
                )
                if r.status_code == 200:
                    tok = r.json()
                    saved["access_token"] = tok["access_token"]
                    if "refresh_token" in tok:
                        saved["refresh_token"] = tok["refresh_token"]
                    saved["expires_at"] = now + float(tok.get("expires_in", 3600))
                    _save_auth(saved)
                    return str(saved["access_token"])
        except Exception:
            pass

    if not interactive_login:
        raise RuntimeError("Higgsfield MCP not yet authorized. Run `python higgsfield_mcp_client.py --login`.")

    # 1. Dynamic Client Registration
    with httpx.Client(timeout=15.0) as client:
        reg_resp = client.post(
            OAUTH_REGISTER_URL,
            json={
                "client_name": "Clipper Studio MCP",
                "redirect_uris": [REDIRECT_URI],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            },
        )
        reg_resp.raise_for_status()
        reg_data = reg_resp.json()
        client_id = reg_data["client_id"]

    # 2. PKCE S256 Challenge
    code_verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(24)

    captured: Dict[str, str] = {}
    done_event = threading.Event()

    class _CallbackHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: Any) -> None:
            return

        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            if "code" in qs:
                captured["code"] = qs["code"][0]
                captured["state"] = qs.get("state", [""])[0]
                body = (
                    b"<html><body style='background:#09090d;color:#10b981;font-family:sans-serif;"
                    b"display:flex;align-items:center;justify-content:center;height:100vh;'>"
                    b"<h2>&#10004; Connected to Higgsfield MCP! You can close this tab.</h2></body></html>"
                )
                self.send_response(200)
            else:
                captured["error"] = qs.get("error", ["oauth_failed"])[0]
                body = b"<html><body><h2>Authorization failed.</h2></body></html>"
                self.send_response(400)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            done_event.set()

    server = http.server.HTTPServer(("127.0.0.1", CALLBACK_PORT), _CallbackHandler)
    srv_thread = threading.Thread(target=server.handle_request, daemon=True)
    srv_thread.start()

    auth_params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "scope": "openid email offline_access",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "resource": MCP_ENDPOINT,
    }
    auth_url = f"{OAUTH_AUTHORIZE_URL}?{urllib.parse.urlencode(auth_params)}"
    print("Opening browser to authorize Higgsfield MCP (https://mcp.higgsfield.ai/mcp)...")
    webbrowser.open(auth_url)

    if not done_event.wait(timeout=180.0):
        server.server_close()
        raise TimeoutError("Timed out waiting for browser authorization on https://mcp.higgsfield.ai/mcp.")
    server.server_close()

    if "error" in captured or "code" not in captured:
        raise RuntimeError(f"OAuth authorization failed: {captured.get('error', 'unknown')}")

    with httpx.Client(timeout=15.0) as client:
        tok_resp = client.post(
            OAUTH_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": captured["code"],
                "redirect_uri": REDIRECT_URI,
                "client_id": client_id,
                "code_verifier": code_verifier,
                "resource": MCP_ENDPOINT,
            },
        )
        tok_resp.raise_for_status()
        tok_data = tok_resp.json()

    saved_payload = {
        "client_id": client_id,
        "access_token": tok_data["access_token"],
        "refresh_token": tok_data.get("refresh_token"),
        "expires_at": time.time() + float(tok_data.get("expires_in", 3600)),
    }
    _save_auth(saved_payload)
    return str(saved_payload["access_token"])


def _parse_mcp_response(resp: httpx.Response) -> Dict[str, Any]:
    ctype = resp.headers.get("content-type", "")
    text = resp.text.strip()
    if "text/event-stream" in ctype or text.startswith("event:") or text.startswith("data:"):
        last_json: Dict[str, Any] = {}
        for line in text.splitlines():
            if line.startswith("data:"):
                raw = line[len("data:") :].strip()
                if raw:
                    try:
                        last_json = json.loads(raw)
                    except Exception:
                        pass
        return last_json
    return resp.json()


class HiggsfieldMCPClient:
    """Streamable HTTP client for `https://mcp.higgsfield.ai/mcp`."""

    def __init__(self, access_token: Optional[str] = None):
        self.access_token = access_token or ensure_mcp_access_token(interactive_login=True)
        self.session_id: Optional[str] = None

    def _headers(self) -> Dict[str, str]:
        h = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.session_id:
            h["Mcp-Session-Id"] = self.session_id
        return h

    def initialize(self) -> Dict[str, Any]:
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                MCP_ENDPOINT,
                headers=self._headers(),
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "clipper-mcp", "version": "1.0.0"},
                    },
                },
            )
            r.raise_for_status()
            if "mcp-session-id" in r.headers:
                self.session_id = r.headers["mcp-session-id"]
            data = _parse_mcp_response(r)
            # Send initialized notification
            client.post(
                MCP_ENDPOINT,
                headers=self._headers(),
                json={"jsonrpc": "2.0", "method": "notifications/initialized"},
            )
            return data

    def list_tools(self) -> List[Dict[str, Any]]:
        if not self.session_id:
            self.initialize()
        with httpx.Client(timeout=30.0) as client:
            r = client.post(
                MCP_ENDPOINT,
                headers=self._headers(),
                json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
            )
            r.raise_for_status()
            data = _parse_mcp_response(r)
            return (data.get("result") or {}).get("tools") or []

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        if not self.session_id:
            self.initialize()
        with httpx.Client(timeout=180.0) as client:
            r = client.post(
                MCP_ENDPOINT,
                headers=self._headers(),
                json={
                    "jsonrpc": "2.0",
                    "id": 3,
                    "method": "tools/call",
                    "params": {"name": name, "arguments": arguments},
                },
            )
            r.raise_for_status()
            return _parse_mcp_response(r)


if __name__ == "__main__":
    mcp = HiggsfieldMCPClient()
    init_res = mcp.initialize()
    tools = mcp.list_tools()
    print(f"Connected to {MCP_ENDPOINT}! Discovered {len(tools)} MCP tools:")
    for t in tools:
        print(f" - {t.get('name')}: {(t.get('description') or '')[:90]}")
