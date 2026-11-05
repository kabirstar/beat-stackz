#!/usr/bin/env python3
"""
Higgsfield API — Seedance 2.5 Text-to-Video Example (`main.py`)
Loads `HF_KEY` (`key-id:key-secret`) from `.env.local` at runtime without exposing credentials,
submits a generation request to `bytedance/seedance-2.5/text-to-video` via `higgsfield_client.subscribe`,
handles failed / canceled / moderated (NSFW) statuses explicitly, and outputs the generated video URL.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
import higgsfield_client
from higgsfield_client import Cancelled, Completed, Failed, NSFW, Status


def _extract_video_url(result: Any) -> Optional[str]:
    """Extract the generated video URL from the Higgsfield response payload."""
    if not isinstance(result, dict):
        return None

    video_obj = result.get("video")
    if isinstance(video_obj, dict) and video_obj.get("url"):
        return str(video_obj["url"])
    if isinstance(video_obj, str) and video_obj.startswith("http"):
        return video_obj

    videos_list = result.get("videos")
    if isinstance(videos_list, list) and videos_list:
        first = videos_list[0]
        if isinstance(first, dict) and first.get("url"):
            return str(first["url"])
        if isinstance(first, str) and first.startswith("http"):
            return first

    for key in ("video_url", "output_url", "url"):
        val = result.get(key)
        if isinstance(val, str) and val.startswith("http"):
            return val

    output = result.get("output")
    if isinstance(output, dict):
        return _extract_video_url(output)

    return None


def main() -> int:
    env_path = Path(__file__).resolve().parent / ".env.local"
    load_dotenv(dotenv_path=env_path, override=False)

    hf_key = (os.environ.get("HF_KEY") or "").strip()
    if not hf_key or hf_key == "your-key-id:your-key-secret" or ":" not in hf_key:
        print(
            "ERROR: Missing or placeholder HF_KEY in .env.local. "
            "Please add your real HF_KEY=key-id:key-secret in clipper/.env.local.",
            file=sys.stderr,
        )
        return 1

    last_status: Optional[Status] = None

    def _on_enqueue(request_id: str) -> None:
        print(f"Queued request: {request_id}")

    def _on_queue_update(status: Status) -> None:
        nonlocal last_status
        last_status = status
        print(f"Status: {status.__class__.__name__}")

    try:
        result = higgsfield_client.subscribe(
            "bytedance/seedance-2.5/text-to-video",
            arguments={
                "prompt": "A cinematic scene at sunset",
                "duration": 5,
                "resolution": "720p",
                "aspect_ratio": "16:9",
            },
            on_enqueue=_on_enqueue,
            on_queue_update=_on_queue_update,
        )
    except Exception as exc:
        print(f"Generation request failed with error: {exc}", file=sys.stderr)
        return 1

    # Explicitly handle Failed, Cancelled, or NSFW (moderated) terminal statuses
    raw_status = str(result.get("status", "")).lower() if isinstance(result, dict) else ""
    if isinstance(last_status, Failed) or raw_status == "failed":
        err_detail = result.get("error") or result.get("detail") or "Unknown error"
        print(f"Generation failed: {err_detail}", file=sys.stderr)
        return 1

    if isinstance(last_status, Cancelled) or raw_status in ("canceled", "cancelled"):
        print("Generation was canceled before completion.", file=sys.stderr)
        return 1

    if isinstance(last_status, NSFW) or raw_status in ("nsfw", "moderated"):
        print("Generation was blocked by content moderation (NSFW).", file=sys.stderr)
        return 1

    if last_status is not None and not isinstance(last_status, Completed) and raw_status != "completed":
        print(f"Generation did not complete successfully (status={last_status}).", file=sys.stderr)
        return 1

    video_url = _extract_video_url(result)
    if not video_url:
        print(f"Generation completed but no video URL was found in payload: {result}", file=sys.stderr)
        return 1

    print(f"Generated video URL: {video_url}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
