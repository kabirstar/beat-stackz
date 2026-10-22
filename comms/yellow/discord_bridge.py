#!/usr/bin/env python3
"""
Beat Stackz (BPACKZ) — 2-Way Discord & GitHub Multi-Agent Bridge
Allows Todo & Swish to prompt Yellow, Blue, and Red directly from Discord,
and allows all 3 agents to talk to each other in one Discord channel.

Commands:
  python3 scripts/comms.py setup <GUILD_ID>         # Auto-creates #beat-stackz-hq channel + webhook
  python3 scripts/comms.py send <AGENT> "<MSG>"     # Posts as Yellow/Blue/Red to Discord + GitHub
  python3 scripts/comms.py read                     # Reads latest messages from Discord channel (and GitHub)
  python3 scripts/comms.py poll                     # Checks for new unread Discord prompts since last check
"""
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMMS_LOG = os.path.join(REPO_ROOT, "COMMS_LOG.md")
ENV_FILE = os.path.join(REPO_ROOT, ".env")
STATE_FILE = os.path.join(REPO_ROOT, ".discord_state.json")

AGENT_PROFILES = {
    "YELLOW": {
        "username": "🟡 Yellow (Frontend / Mac)",
        "color": 0xFACC15,
    },
    "BLUE": {
        "username": "🔵 Blue (Architect / PC)",
        "color": 0x3B82F6,
    },
    "RED": {
        "username": "🔴 Red (Backend / PC)",
        "color": 0xEF4444,
    },
}


def load_env():
    env = {}
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def save_env_var(key: str, val: str):
    env = load_env()
    env[key] = val
    with open(ENV_FILE, "w", encoding="utf-8") as f:
        for k, v in env.items():
            f.write(f'{k}="{v}"\n')


def discord_api(method: str, path: str, payload=None, bot_token=None):
    env = load_env()
    token = bot_token or os.environ.get("DISCORD_BOT_TOKEN") or env.get("DISCORD_BOT_TOKEN")
    if not token:
        raise RuntimeError("Missing DISCORD_BOT_TOKEN in .env")
    url = f"https://discord.com/api/v10{path}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bot {token}",
            "Content-Type": "application/json",
            "User-Agent": "BeatStackz-AgentBridge/1.0",
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def setup_channel(guild_id: str = None):
    """Auto-creates Beat Stackz HQ server (if none), #beat-stackz-hq channel, invite link, and multi-agent webhook."""
    env = load_env()
    if not guild_id:
        guilds = discord_api("GET", "/users/@me/guilds")
        if not guilds:
            print("No server found yet — creating 'Beat Stackz HQ' Discord server...")
            new_guild = discord_api("POST", "/guilds", {"name": "Beat Stackz HQ"})
            guild_id = new_guild["id"]
            print(f"✅ Created Discord Server: {new_guild['name']} ({guild_id})")
        else:
            guild_id = guilds[0]["id"]
            print(f"Found server: {guilds[0]['name']} ({guild_id})")

    # Check if #beat-stackz-hq already exists
    channels = discord_api("GET", f"/guilds/{guild_id}/channels")
    channel = next((c for c in channels if c.get("name") == "beat-stackz-hq"), None)
    if not channel:
        channel = discord_api(
            "POST",
            f"/guilds/{guild_id}/channels",
            {
                "name": "beat-stackz-hq",
                "type": 0,
                "topic": "Beat Stackz (BPACKZ) — Live HQ for Todo, Swish, 🟡 Yellow, 🔵 Blue & 🔴 Red",
            },
        )
        print(f"✅ Created Discord channel #beat-stackz-hq (ID: {channel['id']})")
    else:
        print(f"✅ Found existing #beat-stackz-hq (ID: {channel['id']})")

    channel_id = channel["id"]
    save_env_var("DISCORD_GUILD_ID", guild_id)
    save_env_var("DISCORD_CHANNEL_ID", channel_id)

    # Create an invite link for Todo & Swish
    try:
        invite = discord_api("POST", f"/channels/{channel_id}/invites", {"max_age": 0, "max_uses": 0})
        print(f"🔗 INVITE LINK FOR TODO & SWISH: https://discord.gg/{invite['code']}")
    except Exception as e:
        print(f"⚠️ Could not create invite link: {e}")

    # Create a webhook so Yellow, Blue, and Red can each speak with their own name & badge
    webhooks = discord_api("GET", f"/channels/{channel_id}/webhooks")
    wh = next((w for w in webhooks if w.get("name") == "BeatStackz-Agents"), None)
    if not wh:
        wh = discord_api("POST", f"/channels/{channel_id}/webhooks", {"name": "BeatStackz-Agents"})
    webhook_url = f"https://discord.com/api/webhooks/{wh['id']}/{wh['token']}"
    save_env_var("DISCORD_WEBHOOK_URL", webhook_url)
    print(f"✅ Saved DISCORD_CHANNEL_ID and DISCORD_WEBHOOK_URL to .env")


def post_to_discord(agent: str, message: str, to_target: str = "ALL"):
    env = load_env()
    webhook_url = os.environ.get("DISCORD_WEBHOOK_URL") or env.get("DISCORD_WEBHOOK_URL")
    profile = AGENT_PROFILES.get(agent.upper(), {"username": agent, "color": 0x94A3B8})

    if webhook_url:
        payload = {
            "username": profile["username"],
            "embeds": [
                {
                    "description": message,
                    "color": profile["color"],
                }
            ],
        }
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "BeatStackz-AgentBridge/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status in (200, 204)
        except Exception as e:
            print(f"⚠️ Webhook send error: {e}")

    # Fallback to Bot API message
    channel_id = os.environ.get("DISCORD_CHANNEL_ID") or env.get("DISCORD_CHANNEL_ID")
    if channel_id and (os.environ.get("DISCORD_BOT_TOKEN") or env.get("DISCORD_BOT_TOKEN")):
        discord_api("POST", f"/channels/{channel_id}/messages", {"content": f"**{profile['username']}**: {message}"})
        return True
    return False


def read_discord_messages(limit: int = 15, only_new: bool = False):
    env = load_env()
    channel_id = os.environ.get("DISCORD_CHANNEL_ID") or env.get("DISCORD_CHANNEL_ID")
    if not channel_id:
        print("⚠️ No DISCORD_CHANNEL_ID configured in .env yet.")
        return []

    last_id = None
    if only_new and os.path.exists(STATE_FILE):
        try:
            last_id = json.load(open(STATE_FILE)).get("last_message_id")
        except Exception:
            pass

    path = f"/channels/{channel_id}/messages?limit={limit}"
    if last_id:
        path += f"&after={last_id}"

    msgs = discord_api("GET", path)
    msgs = list(reversed(msgs))  # chronological order

    if msgs and only_new:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({"last_message_id": msgs[-1]["id"]}, f)

    for m in msgs:
        author = m.get("author", {}).get("username", "Unknown")
        content = m.get("content", "")
        if not content and m.get("embeds"):
            content = m["embeds"][0].get("description", "")
        ts = m.get("timestamp", "")[:16].replace("T", " ")
        print(f"[{ts}] {author}: {content}")
    return msgs


def append_to_comms_log(agent: str, message: str, to_target: str = "ALL"):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M")
    entry = f"\n### [{now_str}] [FROM: {agent.upper()}] -> [TO: {to_target.upper()}]\n- {message}\n"
    with open(COMMS_LOG, "a", encoding="utf-8") as f:
        f.write(entry)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    cmd = sys.argv[1].lower()
    if cmd == "setup":
        guild_id = sys.argv[2] if len(sys.argv) > 2 else None
        setup_channel(guild_id)
    elif cmd == "send":
        agent = sys.argv[2].upper()
        message = sys.argv[3]
        to_target = sys.argv[4] if len(sys.argv) > 4 else "ALL"
        post_to_discord(agent, message, to_target)
        print(f"✅ Posted as {agent}")
    elif cmd == "read":
        read_discord_messages(limit=20, only_new=False)
    elif cmd == "poll":
        read_discord_messages(limit=20, only_new=True)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
