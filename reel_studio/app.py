#!/usr/bin/env python3
"""
Reel Studio v2 (Port 5055) — Cinematic Multi-Scene Event & Temple Recap Editor
- Reuses multiple distinct parts of longer clips (`build_cinematic_instagram_storyboard`)
  and interleaves them into an engaging, scroll-stopping Instagram Reel that covers every
  ceremony and event that took place!
- Includes Slow-Motion (`0.70x`, `0.55x`), Hero Speed-Ramps (`speed_ramp`), and Cinematic Film Grades
  both in live browser playback and 1080p Hardware Export (`h264_videotoolbox`).
"""

from __future__ import annotations

import concurrent.futures
import dataclasses
import json
import os
import threading
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from flask import Flask, request, jsonify, send_from_directory, render_template_string
from werkzeug.utils import secure_filename

from reel_engine import (
    ensure_ffmpeg,
    analyze_single_event_clip,
    make_storyboard_item_from_clip,
    build_cinematic_instagram_storyboard,
    suggest_highlight_window,
    ensure_clip_thumbnail,
    render_recap_reel,
    EventClip,
    StoryboardItem,
    SpeechSegment,
    ReelProject,
    CLIP_PALETTE,
    SPEED_MULTIPLIERS,
    IMAGE_EXTS,
    VIDEO_EXTS,
)

BASE_DIR = Path(__file__).resolve().parent
CLIPS_DIR = BASE_DIR / "input" / "clips"
MUSIC_DIR = BASE_DIR / "input" / "music"
OUT_DIR = BASE_DIR / "output"
PROXY_DIR = OUT_DIR / "proxies"
STATE_FILE = OUT_DIR / "reel_project.json"

for d in (CLIPS_DIR, MUSIC_DIR, OUT_DIR, PROXY_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)

STATE_LOCK = threading.Lock()
CURRENT_PROJECT: Optional[Dict[str, Any]] = None
PROJECT_VERSION: int = 1

AGENT_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=6)
AGENTS_LOCK = threading.Lock()
ACTIVE_AGENTS: Dict[str, Dict[str, Any]] = {}

MEDIA_EXTS = VIDEO_EXTS | IMAGE_EXTS
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def update_agent_status(
    agent_id: str,
    name: str,
    role: str,
    stage: str,
    pct: int,
    state: str = "running",
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    with AGENTS_LOCK:
        prev = ACTIVE_AGENTS.get(agent_id, {})
        started_at = prev.get("started_at", time.time())
        entry = {
            "agent_id": agent_id,
            "name": name,
            "role": role,
            "stage": stage,
            "pct": pct,
            "state": state,
            "started_at": started_at,
            "elapsed_sec": round(time.time() - started_at, 1),
            "updated_at": time.time(),
        }
        if extra:
            entry.update(extra)
        ACTIVE_AGENTS[agent_id] = entry


def create_default_project() -> Dict[str, Any]:
    proj = ReelProject(
        project_id=f"reel_{int(time.time())}",
        title="Temple & Event Highlight Reel",
        subtitle="",
        aspect_ratio="9:16",
        default_fit_mode="blur_pad",
        highlight_mode="instagram_cinematic",
        global_title="",
        global_subtitle="",
        global_banner_mode="intro_only",
        clips=[],
        storyboard=[],
        version=1,
    )
    return dataclasses.asdict(proj)


def save_project_state(state_dict: Dict[str, Any]) -> None:
    global CURRENT_PROJECT, PROJECT_VERSION
    with STATE_LOCK:
        CURRENT_PROJECT = state_dict
        PROJECT_VERSION += 1
        state_dict["version"] = PROJECT_VERSION
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state_dict, f, indent=2)


def load_project_state() -> Dict[str, Any]:
    global CURRENT_PROJECT
    with STATE_LOCK:
        if CURRENT_PROJECT is not None:
            return CURRENT_PROJECT
        if STATE_FILE.exists():
            try:
                with open(STATE_FILE, "r", encoding="utf-8") as f:
                    CURRENT_PROJECT = json.load(f)
                    if "version" not in CURRENT_PROJECT:
                        CURRENT_PROJECT["version"] = PROJECT_VERSION
                    return CURRENT_PROJECT
            except Exception:
                pass
        default_p = create_default_project()
        CURRENT_PROJECT = default_p
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(default_p, f, indent=2)
        return CURRENT_PROJECT


def dict_to_clip(c: Dict[str, Any]) -> EventClip:
    valid_keys = {f.name for f in dataclasses.fields(EventClip)}
    filtered = {k: v for k, v in c.items() if k in valid_keys}
    raw_sp = filtered.get("speech_segments") or []
    filtered["speech_segments"] = [
        SpeechSegment(**s) if isinstance(s, dict) else s for s in raw_sp
    ]
    return EventClip(**filtered)


def dict_to_storyboard_item(s: Dict[str, Any]) -> StoryboardItem:
    valid_keys = {f.name for f in dataclasses.fields(StoryboardItem)}
    filtered = {k: v for k, v in s.items() if k in valid_keys}
    if "speed_mode" not in filtered or not filtered["speed_mode"]:
        filtered["speed_mode"] = "1.0x"
    return StoryboardItem(**filtered)


def dict_to_project(d: Dict[str, Any]) -> ReelProject:
    valid_keys = {f.name for f in dataclasses.fields(ReelProject)}
    filtered = {k: v for k, v in d.items() if k in valid_keys}
    filtered["clips"] = [dict_to_clip(c) for c in d.get("clips", [])]
    filtered["storyboard"] = [dict_to_storyboard_item(s) for s in d.get("storyboard", [])]
    return ReelProject(**filtered)


def spawn_event_clip_agent(
    cpath: str,
    cname: str,
    agent_idx: int,
    auto_append_storyboard: bool = True,
) -> str:
    agent_id = f"clip_agent_{int(time.time() * 1000)}_{agent_idx}"
    update_agent_status(
        agent_id=agent_id,
        name=f"Clip Agent #{agent_idx}: {cname}",
        role="VideoToolbox Proxy + 4Hz Action/Audio + Multi-Scene AI",
        stage="🚀 Queued in Parallel Agent Pool...",
        pct=5,
        state="running",
    )

    def _worker():
        try:
            proj = load_project_state()
            h_mode = proj.get("highlight_mode", "instagram_cinematic")

            def _cb(stage_msg: str, pct_val: int):
                update_agent_status(
                    agent_id=agent_id,
                    name=f"Clip Agent #{agent_idx}: {cname}",
                    role="VideoToolbox Proxy + 4Hz Action/Audio + Multi-Scene AI",
                    stage=stage_msg,
                    pct=pct_val,
                    state="running",
                )

            raw_id = f"clip_{int(time.time() * 1000)}_{agent_idx}"
            new_clip = analyze_single_event_clip(
                cpath=cpath,
                clip_id=raw_id,
                color=CLIP_PALETTE[(agent_idx - 1) % len(CLIP_PALETTE)],
                proxy_dir=PROXY_DIR,
                highlight_mode=h_mode,
                transcribe=True,
                progress_cb=_cb,
            )

            with STATE_LOCK:
                cur = CURRENT_PROJECT or create_default_project()
                clips_list = [dict_to_clip(c) for c in cur.get("clips", []) if c.get("filename") != cname]
                clips_list.append(new_clip)
                clips_list.sort(key=lambda c: c.filename.lower())
                for idx_c, c_obj in enumerate(clips_list):
                    c_obj.color = CLIP_PALETTE[idx_c % len(CLIP_PALETTE)]

                if auto_append_storyboard:
                    sb_list = build_cinematic_instagram_storyboard(
                        clips=clips_list,
                        proxy_dir=PROXY_DIR,
                        mode=cur.get("highlight_mode", "instagram_cinematic"),
                        default_fit_mode=cur.get("default_fit_mode", "blur_pad"),
                    )
                else:
                    sb_list = [dict_to_storyboard_item(s) for s in cur.get("storyboard", [])]

                cur["clips"] = [dataclasses.asdict(c) for c in clips_list]
                cur["storyboard"] = [dataclasses.asdict(s) for s in sb_list]

            save_project_state(cur)

            update_agent_status(
                agent_id=agent_id,
                name=f"Clip Agent #{agent_idx}: {cname}",
                role="VideoToolbox Proxy + 4Hz Action/Audio + Multi-Scene AI",
                stage=f"✅ Multi-Scene Ready ({new_clip.duration:.1f}s, {new_clip.orientation})",
                pct=100,
                state="done",
            )
        except Exception as e:
            update_agent_status(
                agent_id=agent_id,
                name=f"Clip Agent #{agent_idx}: {cname}",
                role="VideoToolbox Proxy + 4Hz Action/Audio + Multi-Scene AI",
                stage=f"❌ Error: {e}",
                pct=100,
                state="error",
            )

    AGENT_POOL.submit(_worker)
    return agent_id


HTML_TEMPLATE = r"""
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <title>REEL STUDIO — Cinematic Event & Temple Recap Editor</title>
  <style>
    :root {
      --bg: #09090d;
      --panel: #12121a;
      --panel2: #181824;
      --panel3: #1f1f2e;
      --border: #2a2a3d;
      --gold: #f59e0b;
      --gold-light: #fbbf24;
      --accent: #ff2a85;
      --purple: #8b5cf6;
      --cyan: #06b6d4;
      --green: #10b981;
      --red: #ef4444;
      --text: #f4f4f8;
      --muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif;
      min-height: 100vh;
      width: 100%;
      max-width: 100vw;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      overflow-y: auto;
      user-select: none;
    }

    header {
      min-height: 56px;
      height: auto;
      background: linear-gradient(90deg, #13111c 0%, #191424 50%, #12121a 100%);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      gap: 10px;
      flex-shrink: 0;
      flex-wrap: wrap;
      position: sticky;
      top: 0;
      z-index: 80;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 15px;
      letter-spacing: 0.4px;
    }
    .brand-badge {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #111;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.6px;
    }
    .toolbar-group {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }
    .btn {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 11px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
      white-space: nowrap;
      text-decoration: none;
    }
    .btn:hover { background: var(--panel3); border-color: #3f3f5a; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-gold {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #09090d;
      border: none;
      font-weight: 700;
    }
    .btn-gold:hover { filter: brightness(1.08); }
    .btn-primary {
      background: linear-gradient(135deg, #ff2a85, #7c3aed);
      color: #fff;
      border: none;
      font-weight: 700;
    }
    .btn-primary:hover { filter: brightness(1.1); }
    .btn-download {
      background: rgba(16, 185, 129, 0.18);
      border: 1px solid var(--green);
      color: #6ee7b7;
      font-weight: 700;
    }
    .btn-active {
      background: rgba(245, 158, 11, 0.18);
      border-color: var(--gold);
      color: var(--gold-light);
    }
    select.input-select, input.input-text {
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 12px;
      outline: none;
      max-width: 220px;
    }
    select.input-select:focus, input.input-text:focus {
      border-color: var(--gold);
    }

    .status-bar {
      min-height: 28px;
      background: #0d0d14;
      border-bottom: 1px solid var(--border);
      padding: 4px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11.5px;
      color: var(--muted);
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 8px;
    }

    /* Mobile / Tablet Workspace Tab Switcher (CapCut Web style) */
    .mobile-workspace-tabs {
      display: none;
      background: #101018;
      border-bottom: 1px solid var(--border);
      padding: 6px 12px;
      gap: 6px;
    }
    .mobile-tab-btn {
      flex: 1;
      padding: 7px 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--panel2);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
    }
    .mobile-tab-btn.active {
      background: rgba(245, 158, 11, 0.18);
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .workspace {
      flex: 1;
      display: grid;
      grid-template-columns: 290px minmax(0, 1fr) 350px;
      min-height: 520px;
    }
    .col-panel {
      background: var(--panel);
      display: flex;
      flex-direction: column;
      min-height: 0;
      max-height: calc(100vh - 260px);
      overflow: hidden;
    }
    .col-left { border-right: 1px solid var(--border); }
    .col-right { border-left: 1px solid var(--border); overflow-y: auto; }
    .panel-header {
      padding: 10px 14px;
      background: var(--panel2);
      border-bottom: 1px solid var(--border);
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
      letter-spacing: 0.3px;
    }

    .dropzone {
      margin: 10px;
      padding: 14px 10px;
      border: 1.5px dashed #3b3b54;
      border-radius: 10px;
      background: rgba(245, 158, 11, 0.04);
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--gold);
      background: rgba(245, 158, 11, 0.10);
    }
    .dropzone-title { font-size: 12.5px; font-weight: 700; color: var(--gold-light); margin-bottom: 4px; }
    .dropzone-sub { font-size: 11px; color: var(--muted); }

    .clip-list {
      flex: 1;
      overflow-y: auto;
      padding: 6px 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .lib-card {
      background: var(--panel2);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 8px;
      display: flex;
      gap: 9px;
      align-items: flex-start;
      transition: all 0.15s;
    }
    .lib-card:hover { border-color: #454564; }
    .lib-thumb {
      width: 64px;
      height: 48px;
      border-radius: 6px;
      object-fit: cover;
      background: #000;
      flex-shrink: 0;
    }
    .lib-info { flex: 1; min-width: 0; }
    .lib-name {
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 3px;
    }
    .lib-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .badge {
      padding: 1px 5px;
      border-radius: 4px;
      background: #232334;
      color: #cbd5e1;
      font-weight: 600;
    }
    .badge-gold { background: rgba(245, 158, 11, 0.18); color: var(--gold-light); }
    .badge-cyan { background: rgba(6, 182, 212, 0.18); color: #67e8f9; }
    .badge-purple { background: rgba(139, 92, 246, 0.22); color: #ddd6fe; }
    .lib-speech {
      font-size: 10.5px;
      color: #c4b5fd;
      background: rgba(139, 92, 246, 0.12);
      padding: 3px 6px;
      border-radius: 5px;
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .center-stage {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #07070b;
      min-height: 0;
      padding: 10px 16px;
      gap: 8px;
    }
    .player-viewport-wrap {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 0;
      position: relative;
    }
    .stage-frame {
      position: relative;
      background: #000;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 12px 35px rgba(0, 0, 0, 0.7), 0 0 0 1px #27273a;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: width 0.2s, height 0.2s;
    }
    .stage-frame.ratio-9-16 {
      aspect-ratio: 9 / 16;
      height: 100%;
      max-height: 430px;
    }
    .stage-frame.ratio-16-9 {
      aspect-ratio: 16 / 9;
      width: 100%;
      max-width: 680px;
      max-height: 400px;
    }
    .stage-bg-blur {
      position: absolute;
      inset: -16px;
      background-size: cover;
      background-position: center;
      filter: blur(22px) brightness(0.62) saturate(1.2);
      z-index: 1;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .stage-bg-blur.visible { opacity: 1; }

    .stage-video {
      position: absolute;
      inset: 0;
      z-index: 2;
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: transparent;
      transition: filter 0.15s ease, transform 0.2s ease;
    }
    .stage-video.standby-deck {
      opacity: 0;
      pointer-events: none;
      z-index: 1;
    }
    .stage-video.active-deck {
      opacity: 1;
      z-index: 2;
    }
    .stage-video.fit-cover {
      object-fit: cover;
    }
    .stage-video.fx-cinematic_film {
      filter: contrast(1.08) saturate(1.15) sepia(0.06);
    }
    .stage-video.fx-warm_temple {
      filter: contrast(1.07) saturate(1.20) sepia(0.11) brightness(1.02);
    }
    .stage-video.fx-ken_burns_in {
      transform: scale(1.06);
      filter: contrast(1.06) saturate(1.12);
    }

    /* Live Speed Pill on Stage */
    .stage-speed-pill {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 8;
      background: rgba(15, 12, 22, 0.82);
      border: 1px solid rgba(139, 92, 246, 0.65);
      color: #e9d5ff;
      font-size: 10px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 6px;
      pointer-events: none;
    }

    /* Live WYSIWYG Scrapbook Polaroid Pop-Up Overlay on Top of Playing Video */
    .stage-shutter-flash {
      position: absolute;
      inset: 0;
      z-index: 5;
      background: radial-gradient(circle, rgba(255,251,235,0.75) 0%, rgba(251,191,36,0.35) 100%);
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.08s ease-out;
    }
    .stage-shutter-flash.flash-on {
      opacity: 1;
    }
    .stage-scrapbook-wrap {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: none;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      background: rgba(8, 6, 12, 0.18);
    }
    .stage-scrapbook-wrap.visible {
      display: flex;
    }
    .scrapbook-polaroid {
      position: relative;
      width: 78%;
      max-height: 76%;
      background: #fdf9f0;
      padding: 9px 9px 14px 9px;
      border-radius: 4px;
      box-shadow: 0 18px 38px rgba(0, 0, 0, 0.82), 0 3px 10px rgba(0, 0, 0, 0.55);
      border: 1.5px solid #e2d9c5;
      transition: transform 0.16s cubic-bezier(0.22, 1.35, 0.36, 1);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .scrapbook-polaroid.style-gold_foil {
      background: #191115;
      border: 2px solid #f59e0b;
    }
    .scrapbook-polaroid.style-vintage_print {
      background: #f6eedc;
      border: 1.5px solid #d4c3a3;
    }
    .scrapbook-tape {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%) rotate(-1.5deg);
      width: 36%;
      height: 18px;
      background: rgba(246, 206, 110, 0.82);
      border: 1px solid rgba(217, 165, 60, 0.75);
      box-shadow: 0 2px 5px rgba(0,0,0,0.28);
      border-radius: 2px;
      z-index: 6;
    }
    .scrapbook-img {
      width: 100%;
      max-height: 265px;
      object-fit: cover;
      border-radius: 2px;
      border: 1.5px solid rgba(212, 163, 56, 0.85);
      display: block;
    }

    .stage-global-badge {
      position: absolute;
      top: 14px;
      left: 14px;
      z-index: 5;
      background: rgba(15, 12, 18, 0.84);
      border: 1.5px solid rgba(245, 158, 11, 0.85);
      border-radius: 9px;
      padding: 5px 11px;
      pointer-events: none;
      display: none;
      max-width: 75%;
    }
    .stage-global-title {
      font-size: 11px;
      font-weight: 800;
      color: #fef3c7;
      line-height: 1.2;
    }
    .stage-global-sub {
      font-size: 9px;
      color: #fbbf24;
      margin-top: 2px;
    }

    .stage-caption-wrap {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      z-index: 6;
      max-width: 88%;
      text-align: center;
      pointer-events: none;
      display: none;
      padding: 8px 18px;
      border-radius: 12px;
      transition: all 0.15s ease;
    }
    .stage-caption-wrap.pos-top { top: 12%; }
    .stage-caption-wrap.pos-center { top: 50%; transform: translate(-50%, -50%); }
    .stage-caption-wrap.pos-bottom { bottom: 12%; }

    .stage-caption-wrap.style-temple_gold {
      background: rgba(28, 12, 18, 0.90);
      border: 2px solid #f59e0b;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
      color: #fffbeb;
    }
    .stage-caption-wrap.style-temple_gold .cap-sub { color: #fbbf24; }

    .stage-caption-wrap.style-pill_dark {
      background: rgba(12, 12, 18, 0.85);
      border: 1.5px solid rgba(255, 255, 255, 0.25);
      backdrop-filter: blur(8px);
      color: #ffffff;
    }
    .stage-caption-wrap.style-pill_dark .cap-sub { color: #a5f3fc; }

    .stage-caption-wrap.style-editorial_box {
      background: rgba(254, 249, 238, 0.95);
      border: 2px solid #d97706;
      color: #181210;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    }
    .stage-caption-wrap.style-editorial_box .cap-sub { color: #b45309; }

    .stage-caption-wrap.style-minimal_glow {
      background: transparent;
      border: none;
      color: #ffffff;
      text-shadow: 0 2px 10px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9);
    }
    .stage-caption-wrap.style-minimal_glow .cap-sub { color: #fde047; }

    .cap-main { font-weight: 800; line-height: 1.2; letter-spacing: 0.2px; }
    .cap-sub { font-weight: 600; margin-top: 3px; line-height: 1.2; }
    .size-small .cap-main { font-size: 13px; }
    .size-small .cap-sub { font-size: 10px; }
    .size-medium .cap-main { font-size: 16px; }
    .size-medium .cap-sub { font-size: 11.5px; }
    .size-large .cap-main { font-size: 20px; }
    .size-large .cap-sub { font-size: 13px; }

    .transport-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 6px 12px;
      border-radius: 9px;
      gap: 10px;
    }
    .timecode {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 12px;
      color: var(--gold-light);
      font-weight: 700;
    }
    .trimmer-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 12px;
    }
    .trimmer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      color: var(--muted);
      margin-bottom: 6px;
    }
    #trimCanvas {
      width: 100%;
      height: 56px;
      background: #0c0c14;
      border-radius: 7px;
      cursor: ew-resize;
      display: block;
    }

    .inspector-section {
      padding: 11px 14px;
      border-bottom: 1px solid var(--border);
    }
    .sec-title {
      font-size: 11.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--gold-light);
      margin-bottom: 9px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .form-row {
      margin-bottom: 8px;
    }
    .form-row label {
      display: flex;
      justify-content: space-between;
      font-size: 11.5px;
      color: #cbd5e1;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .form-row input[type="text"], .form-row select {
      width: 100%;
      background: var(--panel2);
      color: var(--text);
      border: 1px solid var(--border);
      padding: 6px 10px;
      border-radius: 7px;
      font-size: 12px;
    }
    .form-row input[type="range"] {
      width: 100%;
      accent-color: var(--gold);
      cursor: pointer;
    }
    .preset-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 5px;
    }
    .chip {
      background: var(--panel2);
      border: 1px solid var(--border);
      color: #e2e8f0;
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 10.5px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .chip:hover {
      border-color: var(--gold);
      color: var(--gold-light);
    }

    .storyboard-dock {
      height: 184px;
      background: #0d0d14;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    .dock-header {
      height: 34px;
      padding: 0 14px;
      background: var(--panel2);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
    }
    .storyboard-ribbon {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .sb-card {
      width: 182px;
      height: 126px;
      background: var(--panel2);
      border: 2px solid var(--border);
      border-radius: 10px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      cursor: pointer;
      position: relative;
      transition: transform 0.12s, border-color 0.12s;
    }
    .sb-card:hover { border-color: #4f4f72; }
    .sb-card.active {
      border-color: var(--gold);
      box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
    }
    .sb-card.dragging { opacity: 0.45; transform: scale(0.96); }
    .sb-thumb-wrap {
      height: 68px;
      position: relative;
      background: #000;
      overflow: hidden;
    }
    .sb-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.90;
    }
    .sb-idx-badge {
      position: absolute;
      top: 5px;
      left: 5px;
      background: rgba(9, 9, 13, 0.85);
      color: var(--gold-light);
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 5px;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .sb-speed-badge {
      position: absolute;
      top: 5px;
      right: 5px;
      background: rgba(124, 58, 237, 0.88);
      color: #fff;
      font-size: 9.5px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
    }
    .sb-dur-badge {
      position: absolute;
      bottom: 4px;
      right: 5px;
      background: rgba(9, 9, 13, 0.85);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .sb-vol-badge {
      position: absolute;
      bottom: 4px;
      left: 5px;
      background: rgba(9, 9, 13, 0.82);
      color: #34d399;
      font-size: 9.5px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .sb-body {
      flex: 1;
      padding: 5px 7px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 10.5px;
    }
    .sb-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
    }
    .sb-fname {
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--text);
    }
    .sb-caption-tag {
      font-size: 9.5px;
      color: var(--gold-light);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sb-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: var(--muted);
    }
    .sb-icon-btn {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      padding: 1px 4px;
      border-radius: 4px;
    }
    .sb-icon-btn:hover { background: #2c2c40; color: #fff; }

    .agents-drawer {
      position: fixed;
      bottom: 192px;
      right: 18px;
      width: 390px;
      max-height: 360px;
      background: #14141f;
      border: 1px solid var(--gold);
      border-radius: 12px;
      box-shadow: 0 16px 40px rgba(0,0,0,0.75);
      z-index: 100;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .agents-list {
      padding: 10px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .agent-item {
      background: var(--panel2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .progress-track {
      height: 5px;
      background: #252538;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 5px;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--gold), var(--accent));
      transition: width 0.25s ease;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 200;
      display: none;
      align-items: center;
      justify-content: center;
    }
    .modal-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      width: 520px;
      max-width: 94vw;
      padding: 20px;
      max-height: 88vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.8);
    }

    /* CapCut / Instagram Reels Segmented Full-Reel Progress Bar */
    .reel-progress-ribbon {
      display: flex;
      align-items: center;
      gap: 3px;
      height: 22px;
      background: #0d0d16;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 3px 6px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .reel-seg-pill {
      height: 100%;
      border-radius: 4px;
      background: #232336;
      position: relative;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 800;
      color: rgba(255,255,255,0.75);
      overflow: hidden;
      transition: filter 0.12s, transform 0.12s;
      min-width: 14px;
    }
    .reel-seg-pill:hover {
      filter: brightness(1.25);
    }
    .reel-seg-pill.active-seg {
      background: linear-gradient(90deg, rgba(245, 158, 11, 0.88), rgba(255, 42, 133, 0.88));
      color: #fff;
      box-shadow: 0 0 8px rgba(245, 158, 11, 0.55);
    }

    /* Responsive Tablet & Mobile Breakpoints */
    @media (max-width: 1180px) {
      .workspace {
        grid-template-columns: 1fr;
        min-height: auto;
      }
      .col-panel {
        max-height: 540px;
        border-right: none;
        border-left: none;
        border-bottom: 1px solid var(--border);
      }
      .mobile-workspace-tabs {
        display: flex;
        position: sticky;
        top: 56px;
        z-index: 75;
      }
      body.mobile-tab-mode .col-left,
      body.mobile-tab-mode .center-stage,
      body.mobile-tab-mode .col-right {
        display: none;
      }
      body.mobile-tab-mode.active-tab-media .col-left { display: flex; }
      body.mobile-tab-mode.active-tab-stage .center-stage { display: flex; }
      body.mobile-tab-mode.active-tab-inspector .col-right { display: flex; }
    }
    @media (max-width: 768px) {
      header { padding: 8px 10px; gap: 6px; }
      .brand { font-size: 13px; }
      .toolbar-group { width: 100%; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
      .btn { padding: 5px 9px; font-size: 11px; }
      .transport-bar { flex-wrap: wrap; }
      .trimmer-header { flex-wrap: wrap; gap: 6px; }
      .dock-header { flex-wrap: wrap; height: auto; padding: 6px 10px; gap: 6px; }
    }
  </style>
</head>
<body class="mobile-tab-mode active-tab-stage">

  <!-- TOP HEADER -->
  <header>
    <div class="brand">
      <span class="brand-badge">REEL STUDIO</span>
      <span>🏛️ Cinematic Event & Temple Recap</span>
    </div>

    <div class="toolbar-group">
      <button id="btnRatio916" class="btn btn-active" onclick="setAspectRatio('9:16')" title="9:16 Vertical Reel (1080x1920)">
        📱 9:16 Vertical
      </button>
      <button id="btnRatio169" class="btn" onclick="setAspectRatio('16:9')" title="16:9 Horizontal Recap (1920x1080)">
        🖥️ 16:9 Horizontal
      </button>

      <select id="defaultFitSelect" class="input-select" onchange="updateProjectSettings()" title="How horizontal clips fit inside a vertical reel">
        <option value="blur_pad">🌫️ Blurred Backdrop Fill</option>
        <option value="cover">🔍 Smart Center Crop</option>
      </select>

      <select id="highlightModeSelect" class="input-select" title="Highlight Story & Pacing Mode">
        <option value="instagram_cinematic">🎬 Instagram Cinematic (1 Cut/Clip + Slow-Mo)</option>
        <option value="dynamic_35">⚡ Peak Highlights (~3.5s)</option>
        <option value="fast_25">🔥 Fast Action Reel (~2.5s)</option>
        <option value="cinematic_50">🌅 Long Scenic Cuts (~4.5s)</option>
        <option value="speech_aware">🗣️ Speech & Chant Aware</option>
        <option value="full">🎞️ Full Untrimmed Clips</option>
      </select>
      <button class="btn btn-gold" onclick="autoPickHighlights()">
        ✨ Build Cinematic Storyboard
      </button>
    </div>

    <div class="toolbar-group">
      <button class="btn" onclick="openMusicBannerModal()">
        🎵 Music & Event Banner
      </button>
      <button class="btn" onclick="toggleAgentsDrawer()">
        🤖 Agents <span id="agentCountBadge" class="badge badge-gold">0</span>
      </button>
      <details style="position:relative;">
        <summary class="btn" style="list-style:none;" title="Keyboard Shortcuts">⌨️ Keys</summary>
        <div style="position:absolute;right:0;top:36px;z-index:120;background:#141422;border:1px solid var(--border);border-radius:10px;padding:10px 12px;width:235px;box-shadow:0 12px 30px rgba(0,0,0,0.75);font-size:11px;display:flex;flex-direction:column;gap:5px;">
          <div style="font-weight:800;color:var(--gold-light);margin-bottom:2px;">⌨️ Studio Shortcuts</div>
          <div style="display:flex;justify-content:space-between;"><span>Play / Pause Reel</span><code>Space</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Prev / Next Scene</span><code>← / →</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Loop Active Cut</span><code>L</code></div>
        </div>
      </details>
      <button id="exportBtn" class="btn btn-primary" onclick="exportReelNow()">
        🚀 Export 1080p MP4
      </button>
      <a id="headerDownloadReelBtn" class="btn btn-download" href="/output/cinematic_temple_reel_1080p.mp4" download style="display:none;">
        ⬇️ Download MP4
      </a>
    </div>
  </header>

  <!-- STATUS BAR -->
  <div class="status-bar">
    <span id="statusBanner">Ready — 1 Best Highlight Per Clip (No Reused Clips) • Clean Regular Cuts (Zero Black Flash) • Slow-Motion & Native Audio!</span>
    <span id="projectSummaryTag">0 Clips • 0.0s Total Reel • 100% Native Event Audio</span>
  </div>

  <!-- MOBILE / TABLET WORKSPACE SWITCHER (CapCut Web style) -->
  <div class="mobile-workspace-tabs">
    <button type="button" class="mobile-tab-btn" id="mobTabMedia" onclick="switchMobileTab('media')">📂 Media Bin</button>
    <button type="button" class="mobile-tab-btn active" id="mobTabStage" onclick="switchMobileTab('stage')">🎬 Stage &amp; Trimmer</button>
    <button type="button" class="mobile-tab-btn" id="mobTabInspector" onclick="switchMobileTab('inspector')">🎛️ Cut Inspector</button>
  </div>

  <!-- 3-COLUMN STUDIO WORKSPACE -->
  <div class="workspace">

    <!-- LEFT COLUMN: EVENT CLIP LIBRARY -->
    <div class="col-panel col-left">
      <div class="panel-header">
        <span>📂 EVENT CLIPS (<span id="clipCountLabel">0</span>)</span>
        <div style="display:flex; gap:5px;">
          <button class="btn" style="padding:3px 8px; font-size:11px;" onclick="syncClipsFolder()" title="Scan input/clips/ folder">
            🔄 Scan Folder
          </button>
        </div>
      </div>

      <div id="clipDropzone" class="dropzone" onclick="document.getElementById('clipFileInput').click()">
        <div class="dropzone-title">➕ Drop Event Videos & Photos Here</div>
        <div class="dropzone-sub">or click to browse (.MOV, .MP4, .JPG, .PNG, .HEIC) — Videos + Living Photos</div>
        <input id="clipFileInput" type="file" multiple accept="video/*,image/*,.mov,.mp4,.jpg,.jpeg,.png,.heic,.webp" style="display:none" onchange="uploadSelectedFiles(this.files)" />
      </div>

      <div id="libraryClipList" class="clip-list"></div>
    </div>

    <!-- CENTER COLUMN: LIVE STAGE & 4HZ ENERGY TRIMMER -->
    <div class="center-stage">
      <div class="player-viewport-wrap">
        <div id="stageFrame" class="stage-frame ratio-9-16">
          <div id="stageBgBlur" class="stage-bg-blur"></div>
          <!-- Dual-Deck Preloaded Video Elements eliminate black flash on cuts! -->
          <video id="previewVideoA" class="stage-video active-deck" playsinline preload="auto"></video>
          <video id="previewVideoB" class="stage-video standby-deck" playsinline preload="auto" muted></video>

          <!-- Warm Camera Shutter Flash when Scrapbook Photo Pops Up -->
          <div id="stageShutterFlash" class="stage-shutter-flash"></div>

          <!-- Live WYSIWYG Scrapbook Polaroid Print Pop-Up ON TOP of the Playing Video -->
          <div id="stageScrapbookWrap" class="stage-scrapbook-wrap">
            <div id="stageScrapbookCard" class="scrapbook-polaroid">
              <div id="stageScrapbookTape" class="scrapbook-tape"></div>
              <img id="stageScrapbookImg" class="scrapbook-img" src="" alt="" />
            </div>
          </div>

          <!-- Live Speed / Slow-Mo Indicator Pill -->
          <div id="stageSpeedPill" class="stage-speed-pill">1.0x Normal</div>

          <!-- Live WYSIWYG Global Event Header Badge -->
          <div id="stageGlobalBadge" class="stage-global-badge">
            <div id="stageGlobalTitle" class="stage-global-title"></div>
            <div id="stageGlobalSub" class="stage-global-sub"></div>
          </div>

          <!-- Live WYSIWYG Per-Clip Lower-Third / Caption Overlay -->
          <div id="stageCaptionBox" class="stage-caption-wrap pos-bottom style-temple_gold size-medium">
            <div id="stageCaptionMain" class="cap-main"></div>
            <div id="stageCaptionSub" class="cap-sub"></div>
          </div>
        </div>
      </div>

      <!-- Segmented Full-Reel Progress Bar (CapCut / Instagram Reels style) -->
      <div class="reel-progress-ribbon" id="reelProgressRibbon" title="Click any scene segment to jump directly to that cut"></div>

      <!-- Transport Controls -->
      <div class="transport-bar">
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <button class="btn" onclick="stepStoryboard(-1)" title="Previous Cut (Left Arrow)">⏮</button>
          <button id="playPauseBtn" class="btn btn-gold" onclick="togglePlayReel()" style="min-width:130px; justify-content:center;">
            ▶ Play Full Reel
          </button>
          <button id="loopClipBtn" class="btn" onclick="toggleLoopCurrentClip()" title="Loop Current Selected Cut (L)">
            🔁 Loop Cut
          </button>
          <button class="btn" onclick="stepStoryboard(1)" title="Next Cut (Right Arrow)">⏭</button>
        </div>

        <div id="activeClipBanner" style="font-size:12px; font-weight:700; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          No cut selected
        </div>

        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <div class="timecode" id="timecodeDisplay">00:00.0 / 00:00.0</div>
          <button class="btn btn-primary" style="padding:5px 10px;font-size:11px;" onclick="exportReelNow()">🚀 Export MP4</button>
          <a id="transportDownloadReelBtn" class="btn btn-download" style="padding:5px 10px;font-size:11px;display:none;" href="/output/cinematic_temple_reel_1080p.mp4" download>⬇️ Download MP4</a>
        </div>
      </div>

      <!-- Interactive 4Hz Visual + Audio Excitement Trimmer -->
      <div class="trimmer-box">
        <div class="trimmer-header">
          <span id="trimmerTitle">📈 4Hz Action Motion (Gold) + Native Audio Excitement (Cyan) — Drag [IN / OUT] Handles</span>
          <div style="display:flex; gap:6px;">
            <button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="snapSelectedToPeak()">✨ Peak Highlight</button>
            <button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="snapSelectedToSpeech()">🗣️ Spoken Moment</button>
            <button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="expandSelectedFullClip()">↔ Full Clip</button>
            <button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="splitSelectedClipAtPlayhead()">✂️ Split</button>
            <button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="duplicateSelectedClip()">⧉ Reuse Clip</button>
          </div>
        </div>
        <canvas id="trimCanvas" width="900" height="56"></canvas>
      </div>
    </div>

    <!-- RIGHT COLUMN: PER-CLIP SPEED, AUDIO, TEXT OVERLAY & VISUAL INSPECTOR -->
    <div class="col-panel col-right">
      <div class="panel-header">
        <span>🎛️ CUT INSPECTOR & CINEMATICS</span>
        <span id="inspClipBadge" class="badge badge-gold">—</span>
      </div>

      <!-- 1. Cinematic Speed, Slow-Motion & Look -->
      <div class="inspector-section">
        <div class="sec-title">
          <span>🎬 1. Speed, Slow-Mo & Film Grade</span>
        </div>

        <div class="form-row">
          <label>
            <span>Playback Speed / Slow-Motion</span>
            <span id="inspEffectiveDurLabel" style="color:#c4b5fd; font-size:10.5px;"></span>
          </label>
          <select id="inspSpeedMode" onchange="onInspectorLookChange()">
            <option value="1.0x">▶️ 1.0x Real-Time (Natural Pace)</option>
            <option value="0.70x">🎬 0.70x Cinematic Slow-Mo (Silky Smooth)</option>
            <option value="0.55x">✨ 0.55x Dreamy Slow-Mo (Sacred / Hero Moment)</option>
            <option value="speed_ramp">⚡ Hero Speed-Ramp (Fast 1.35x ➜ 0.55x Slow-Mo)</option>
            <option value="1.25x">🔥 1.25x Energetic Fast Cut</option>
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div class="form-row">
            <label><span>Cinematic Look / Motion</span></label>
            <select id="inspEffect" onchange="onInspectorLookChange()">
              <option value="cinematic_film">🎞️ Cinematic Warm Film</option>
              <option value="warm_temple">🪔 Sacred Temple Gold Glow</option>
              <option value="photo_parallax_in">📸 3D Photo Push-In + Gold Frame</option>
              <option value="photo_polaroid_gold">🖼️ Sacred Gold Frame Showcase</option>
              <option value="photo_reveal_out">🌅 Photo Pull-Back Reveal</option>
              <option value="photo_pan_drift">🎥 Photo Floating Drift</option>
              <option value="ken_burns_in">🎥 Dynamic Gimbal Push-In</option>
              <option value="ken_burns_out">🎥 Gimbal Pull-Back Reveal</option>
              <option value="punch_zoom">💥 Scroll-Stopper Punch Zoom</option>
              <option value="cinema_glow">✨ Crisp Cinema Contrast</option>
              <option value="none">Clean Unfiltered</option>
            </select>
          </div>
          <div class="form-row">
            <label><span>Cut Transition</span></label>
            <select id="inspTransition" onchange="onInspectorLookChange()">
              <option value="none">Clean Regular Cut (Zero Flash)</option>
              <option value="flash_white">Subtle Warm Exposure Cut</option>
            </select>
          </div>
        </div>

        <div class="form-row" style="margin-bottom:2px;">
          <label><span>Aspect Ratio Framing</span></label>
          <select id="inspFitMode" onchange="onInspectorLookChange()">
            <option value="auto">Use Project Default</option>
            <option value="blur_pad">🌫️ Blurred Backdrop Fill (No Crop)</option>
            <option value="cover">🔍 Smart Center Fill (Full Bleed)</option>
          </select>
        </div>
      </div>

      <!-- 1B. Scrapbook Photo Pop-Up Overlay (Flashes ON TOP of Playing Video) -->
      <div class="inspector-section" style="background: rgba(245, 158, 11, 0.04);">
        <div class="sec-title">
          <span>📸 Scrapbook Photo Pop-Up (On Video)</span>
          <span id="inspScrapbookBadge" class="badge badge-gold">OFF</span>
        </div>

        <div class="form-row">
          <label><span>Flash Photo Over This Video Cut</span></label>
          <select id="inspScrapbookPhoto" onchange="onInspectorScrapbookChange()">
            <option value="">— None (Video Only) —</option>
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div class="form-row">
            <label><span>Scrapbook Frame</span></label>
            <select id="inspScrapbookStyle" onchange="onInspectorScrapbookChange()">
              <option value="polaroid_tape">🗂️ Polaroid + Gold Tape</option>
              <option value="gold_foil">🪔 Sacred Gold Foil Card</option>
              <option value="vintage_print">📜 Warm Vintage Print</option>
            </select>
          </div>
          <div class="form-row">
            <label><span>Pop-Up Timing</span></label>
            <select id="inspScrapbookTiming" onchange="onInspectorScrapbookChange()">
              <option value="pop_after_1s">⚡ Short Flash (~1.2s)</option>
              <option value="pop_early">⚡ Quick Flash (~0.85s)</option>
              <option value="full">🖼️ Whole Cut Duration</option>
            </select>
          </div>
        </div>

        <div class="form-row" style="margin-bottom:2px;">
          <label>
            <span>Scrapbook Tilt Angle</span>
            <span id="inspScrapbookTiltLabel" style="color:var(--gold-light); font-weight:800;">-3.0°</span>
          </label>
          <input id="inspScrapbookTilt" type="range" min="-8" max="8" step="0.5" value="-3.0" oninput="onInspectorScrapbookChange()" />
        </div>
      </div>

      <!-- 2. Original Clip Audio & Volume -->
      <div class="inspector-section">
        <div class="sec-title">
          <span>🔊 2. Original Native Audio</span>
          <button class="btn" style="padding:2px 7px; font-size:10px;" onclick="applyVolumeToAllClips()">Apply % to All</button>
        </div>

        <div class="form-row">
          <label>
            <span>Native Event Audio Volume</span>
            <span id="volPctLabel" style="color:var(--gold-light); font-weight:800;">100%</span>
          </label>
          <input id="inspVolumeSlider" type="range" min="0" max="200" step="5" value="100" oninput="onInspectorAudioChange()" />
        </div>

        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:4px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:11.5px; cursor:pointer;">
            <input id="inspMuteCheck" type="checkbox" onchange="onInspectorAudioChange()" />
            <span>🔇 Mute this cut's audio</span>
          </label>
          <span id="inspTranscriptHint" style="font-size:10.5px; color:#c4b5fd;"></span>
        </div>
      </div>

      <!-- 3. Per-Clip Text & Title Overlays -->
      <div class="inspector-section">
        <div class="sec-title">
          <span>🏷️ 3. Text & Title Overlay</span>
          <button class="btn" style="padding:2px 7px; font-size:10px;" onclick="clearClipOverlayText()">Clear</button>
        </div>

        <div class="form-row">
          <label><span>Primary Title / Caption</span></label>
          <input id="inspOverlayText" type="text" placeholder="e.g. Sacred Kalasha Procession" oninput="onInspectorOverlayChange()" />
        </div>

        <div class="form-row">
          <label><span>Subtitle / Ceremony Tag</span></label>
          <input id="inspOverlaySubtext" type="text" placeholder="e.g. Grand Temple Entry • Blessings" oninput="onInspectorOverlayChange()" />
        </div>

        <div class="form-row">
          <label><span>Quick Temple & Event Presets</span></label>
          <div class="preset-chips">
            <span class="chip" onclick="applyCaptionPreset('🏺 Sacred Kalasha Procession', 'Ceremonial Temple Entry')">🏺 Kalasha Procession</span>
            <span class="chip" onclick="applyCaptionPreset('🔥 Sacred Yagna & Homa', 'Vedic Fire Ceremony')">🔥 Sacred Yagna</span>
            <span class="chip" onclick="applyCaptionPreset('🎶 Bhajan & Kirtan', 'Devotional Satsang & Tabla')">🎶 Bhajan & Tabla</span>
            <span class="chip" onclick="applyCaptionPreset('🙏 Sanctum Darshan & Pooja', 'Divine Blessings & Prayers')">🙏 Darshan & Pooja</span>
            <span class="chip" onclick="applyCaptionPreset('🪔 Maha Aarti & Archana', 'Sacred Lamp Ceremony')">🪔 Maha Aarti</span>
            <span class="chip" onclick="ClearAllCaptionsInReel()">🧹 Clear All Captions</span>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:8px;">
          <div class="form-row">
            <label><span>Position</span></label>
            <select id="inspOverlayPos" onchange="onInspectorOverlayChange()">
              <option value="bottom">Bottom Lower-Third</option>
              <option value="center">Center Title</option>
              <option value="top">Top Header</option>
            </select>
          </div>
          <div class="form-row">
            <label><span>Style Theme</span></label>
            <select id="inspOverlayStyle" onchange="onInspectorOverlayChange()">
              <option value="temple_gold">🪔 Temple Gold & Crimson</option>
              <option value="pill_dark">🌑 Dark Glass Pill</option>
              <option value="editorial_box">📜 Editorial Ivory & Gold</option>
              <option value="minimal_glow">✨ Minimal Cinema Glow</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <div class="form-row">
            <label><span>Text Size</span></label>
            <select id="inspOverlaySize" onchange="onInspectorOverlayChange()">
              <option value="small">Small</option>
              <option value="medium" selected>Medium</option>
              <option value="large">Large</option>
            </select>
          </div>
          <div class="form-row">
            <label><span>Display Timing</span></label>
            <select id="inspOverlayTiming" onchange="onInspectorOverlayChange()">
              <option value="full">Full Cut Duration</option>
              <option value="intro_3s">First 3.0s Intro</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- BOTTOM STORYBOARD DOCK -->
  <div class="storyboard-dock">
    <div class="dock-header">
      <div style="display:flex; align-items:center; gap:12px;">
        <span>🎞️ MULTI-SCENE STORYBOARD RIBBON (<span id="sbCountLabel">0</span> CUTS)</span>
        <span style="font-size:11px; color:var(--muted); font-weight:500;">Long clips are automatically split into multiple non-overlapping scenes & interleaved with Slow-Mo!</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="btn" style="padding:3px 9px; font-size:11px;" onclick="autoPickHighlights()">🎬 Re-Weave Multi-Scene Reel</button>
        <button class="btn" style="padding:3px 9px; font-size:11px;" onclick="sortStoryboard('chronological')">📂 Sort by Filename</button>
        <button class="btn" style="padding:3px 9px; font-size:11px;" onclick="sortStoryboard('energy')">🔥 Sort by Peak Energy</button>
      </div>
    </div>
    <div id="storyboardRibbon" class="storyboard-ribbon"></div>
  </div>

  <!-- AGENT SWARM DRAWER -->
  <div id="agentsDrawer" class="agents-drawer">
    <div class="panel-header">
      <span>🤖 PARALLEL AGENT SWARM TELEMETRY</span>
      <button class="btn" style="padding:2px 7px; font-size:11px;" onclick="toggleAgentsDrawer(false)">✕</button>
    </div>
    <div id="agentsList" class="agents-list"></div>
  </div>

  <!-- MODAL: GLOBAL EVENT BANNER & OPTIONAL BACKGROUND MUSIC -->
  <div id="musicBannerModal" class="modal-backdrop">
    <div class="modal-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
        <h3 style="font-size:15px; color:var(--gold-light);">🎵 Background Music Bed & Global Event Banner</h3>
        <button class="btn" onclick="closeMusicBannerModal()">✕</button>
      </div>

      <div class="inspector-section" style="padding:10px 0;">
        <div class="sec-title"><span>🏛️ Global Event / Temple Header Badge</span></div>
        <div class="form-row">
          <label><span>Global Event / Temple Title</span></label>
          <input id="modalGlobalTitle" type="text" placeholder="e.g. Sri Venkateswara Temple • Maha Utsavam" />
        </div>
        <div class="form-row">
          <label><span>Global Date / Location Subtitle</span></label>
          <input id="modalGlobalSubtitle" type="text" placeholder="e.g. Sacred Kalasha Procession & Yagna" />
        </div>
        <div class="form-row">
          <label><span>Display Global Badge On</span></label>
          <select id="modalGlobalMode">
            <option value="intro_only">Intro Cut Only (#1)</option>
            <option value="all_clips">All Cuts in Reel (Watermark)</option>
            <option value="off">Hidden / Off</option>
          </select>
        </div>
      </div>

      <div class="inspector-section" style="padding:12px 0; border-bottom:none;">
        <div class="sec-title"><span>🎶 Optional Background Ambient / Bhajan Music Bed</span></div>
        <p style="font-size:11.5px; color:var(--muted); margin-bottom:10px;">
          Every clip plays its <strong>original native audio</strong> (even on slow-motion cuts via natural J/L-cut audio continuity!). You can optionally layer a music track underneath.
        </p>

        <div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">
          <input id="bgMusicFileInput" type="file" accept="audio/*,.mp3,.wav,.m4a" style="font-size:11.5px; flex:1;" />
          <button class="btn btn-gold" onclick="uploadBgMusicNow()">📤 Upload Audio</button>
        </div>

        <div id="bgMusicCurrentLabel" style="font-size:11.5px; color:#34d399; margin-bottom:10px;">
          No background music loaded (100% original clip audio only)
        </div>

        <div style="display:flex; gap:16px; align-items:center; margin-bottom:10px;">
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
            <input id="modalBgEnabled" type="checkbox" />
            <span>Enable Background Music Bed</span>
          </label>
          <label style="display:flex; align-items:center; gap:6px; font-size:12px; cursor:pointer;">
            <input id="modalBgDucking" type="checkbox" checked />
            <span>🦆 Auto-Duck Under Clip Audio/Speech</span>
          </label>
        </div>

        <div class="form-row">
          <label>
            <span>Background Music Volume (Under Original Audio)</span>
            <span id="modalBgVolLabel">22%</span>
          </label>
          <input id="modalBgVolSlider" type="range" min="5" max="100" step="1" value="22" oninput="document.getElementById('modalBgVolLabel').textContent = this.value + '%'" />
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
        <button class="btn btn-gold" onclick="saveMusicBannerSettings()">💾 Save Banner & Audio Settings</button>
      </div>
    </div>
  </div>

  <!-- MODAL: EXPORT RESULT -->
  <div id="exportModal" class="modal-backdrop">
    <div class="modal-card" style="width:600px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="font-size:15px; color:var(--gold-light);">✅ 1080p Cinematic Event Reel Exported!</h3>
        <button class="btn" onclick="document.getElementById('exportModal').style.display='none'">✕</button>
      </div>
      <video id="exportedVideoPlayer" controls style="width:100%; max-height:420px; background:#000; border-radius:10px; margin-bottom:12px;"></video>
      <div id="exportedPathLabel" style="font-size:11.5px; color:var(--muted); margin-bottom:12px; word-break:break-all;"></div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <a id="exportDownloadLink" class="btn btn-gold" href="#" download style="text-decoration:none;">⬇️ Download MP4</a>
      </div>
    </div>
  </div>

  <script>
    let currentProject = null;
    let lastKnownVersion = 0;
    let selectedSbId = null;
    let isPlayingReel = false;
    let loopCurrentClip = false;
    let dragHandle = null;
    let draggedCardIdx = null;
    let saveDebounceTimer = null;

    const SPEED_MAP = {
      '1.0x': 1.0,
      '0.70x': 0.70,
      '0.55x': 0.55,
      'speed_ramp': 0.72,
      '1.25x': 1.25,
    };

    const SPEED_LABELS = {
      '1.0x': '1.0x Real-Time',
      '0.70x': '🎬 0.70x Slow-Mo',
      '0.55x': '✨ 0.55x Dreamy Slow-Mo',
      'speed_ramp': '⚡ Speed-Ramp Slow-Mo',
      '1.25x': '🔥 1.25x Fast',
    };

    let audioCtx = null;
    let mediaSourceNodeA = null;
    let mediaSourceNodeB = null;
    let clipGainNodeA = null;
    let clipGainNodeB = null;
    let bgAudioEl = new Audio();
    bgAudioEl.loop = true;

    const previewVideoA = document.getElementById('previewVideoA');
    const previewVideoB = document.getElementById('previewVideoB');
    let previewVideo = previewVideoA;
    let standbyVideo = previewVideoB;
    let preloadedSbId = null;

    const trimCanvas = document.getElementById('trimCanvas');
    const statusBanner = document.getElementById('statusBanner');

    function getCutPlayDuration(item) {
      if (!item) return 0;
      const srcDur = Math.max(0.2, item.out_sec - item.in_sec);
      const mult = SPEED_MAP[item.speed_mode || '1.0x'] || 1.0;
      return srcDur / mult;
    }

    function ensureWebAudioBoost() {
      if (audioCtx) return;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        mediaSourceNodeA = audioCtx.createMediaElementSource(previewVideoA);
        mediaSourceNodeB = audioCtx.createMediaElementSource(previewVideoB);
        clipGainNodeA = audioCtx.createGain();
        clipGainNodeB = audioCtx.createGain();
        mediaSourceNodeA.connect(clipGainNodeA);
        mediaSourceNodeB.connect(clipGainNodeB);
        clipGainNodeA.connect(audioCtx.destination);
        clipGainNodeB.connect(audioCtx.destination);
      } catch (e) {
        console.warn('WebAudio fallback:', e);
      }
    }

    function preloadNextCutOnStandby(currentItem) {
      if (!currentProject || !currentProject.storyboard || currentProject.storyboard.length < 2) return;
      const sb = currentProject.storyboard;
      const curIdx = sb.indexOf(currentItem);
      const nextIdx = (curIdx + 1) % sb.length;
      const nextItem = sb[nextIdx];
      if (!nextItem || nextItem.id === currentItem.id) return;

      preloadedSbId = nextItem.id;
      const needsLoad = !standbyVideo.src || !standbyVideo.src.endsWith(nextItem.proxy_url);
      standbyVideo.muted = true;
      if (clipGainNodeA && clipGainNodeB) {
        const standbyGain = (standbyVideo === previewVideoA) ? clipGainNodeA : clipGainNodeB;
        standbyGain.gain.value = 0.0;
      }
      if (needsLoad) {
        standbyVideo.src = nextItem.proxy_url;
        standbyVideo.onloadedmetadata = () => {
          standbyVideo.currentTime = nextItem.in_sec;
          standbyVideo.onloadedmetadata = null;
        };
      } else {
        try {
          if (Math.abs(standbyVideo.currentTime - nextItem.in_sec) > 0.08) {
            standbyVideo.currentTime = nextItem.in_sec;
          }
        } catch (e) {}
      }
    }

    function applyLiveClipAudioAndSpeed(item) {
      if (!item) return;
      const gainVal = item.muted ? 0.0 : Math.max(0.0, (item.volume_pct ?? 100) / 100.0);
      if (clipGainNodeA && clipGainNodeB && audioCtx) {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const activeGain = (previewVideo === previewVideoA) ? clipGainNodeA : clipGainNodeB;
        const standbyGain = (previewVideo === previewVideoA) ? clipGainNodeB : clipGainNodeA;
        activeGain.gain.value = gainVal;
        standbyGain.gain.value = 0.0;
        previewVideo.muted = false;
        previewVideo.volume = 1.0;
        standbyVideo.muted = true;
      } else {
        previewVideo.muted = item.muted || gainVal === 0;
        previewVideo.volume = Math.min(1.0, gainVal);
        standbyVideo.muted = true;
      }

      // Apply live playback speed / slow-motion in browser preview
      const spMode = item.speed_mode || '1.0x';
      const baseRate = SPEED_MAP[spMode] || 1.0;
      previewVideo.preservesPitch = true;
      previewVideo.playbackRate = baseRate;

      const pill = document.getElementById('stageSpeedPill');
      pill.textContent = SPEED_LABELS[spMode] || '1.0x';
      pill.style.borderColor = spMode === '1.0x' ? 'rgba(255,255,255,0.2)' : '#f59e0b';
      pill.style.color = spMode === '1.0x' ? '#cbd5e1' : '#fde047';

      if (currentProject && currentProject.bg_music_enabled && currentProject.bg_music_url) {
        if (!bgAudioEl.src.endsWith(currentProject.bg_music_url)) {
          bgAudioEl.src = currentProject.bg_music_url;
        }
        let bgVol = (currentProject.bg_music_volume_pct || 22) / 100.0;
        if (currentProject.bg_music_ducking && gainVal > 0.2) {
          bgVol *= 0.45;
        }
        bgAudioEl.volume = Math.min(1.0, Math.max(0.0, bgVol));
      } else {
        bgAudioEl.pause();
      }
    }

    function getSelectedStoryboardItem() {
      if (!currentProject || !currentProject.storyboard || !currentProject.storyboard.length) return null;
      let found = currentProject.storyboard.find(s => s.id === selectedSbId);
      if (!found) {
        found = currentProject.storyboard[0];
        selectedSbId = found.id;
      }
      return found;
    }

    function getClipById(clipId) {
      if (!currentProject || !currentProject.clips) return null;
      return currentProject.clips.find(c => c.clip_id === clipId) || null;
    }

    function switchMobileTab(tab) {
      document.body.classList.remove('active-tab-media', 'active-tab-stage', 'active-tab-inspector');
      document.body.classList.add('active-tab-' + tab);
      ['media', 'stage', 'inspector'].forEach(t => {
        const b = document.getElementById('mobTab' + t.charAt(0).toUpperCase() + t.slice(1));
        if (b) b.classList.toggle('active', t === tab);
      });
    }

    function renderReelProgressRibbon() {
      const container = document.getElementById('reelProgressRibbon');
      if (!container) return;
      const sb = (currentProject && currentProject.storyboard) || [];
      if (!sb.length) {
        container.innerHTML = '<span style="font-size:10.5px;color:var(--muted);padding-left:6px;">No scenes in reel yet</span>';
        return;
      }
      const totalDur = Math.max(0.1, sb.reduce((acc, s) => acc + getCutPlayDuration(s), 0));
      container.innerHTML = sb.map((s, idx) => {
        const d = getCutPlayDuration(s);
        const flexVal = Math.max(1, Math.round((d / totalDur) * 100));
        const isSel = s.id === selectedSbId;
        const hasScrap = !!(s.scrapbook_photo_id || s.scrapbook_photo_filepath);
        const isSlow = (s.speed_mode || '1.0x') !== '1.0x';
        const icon = hasScrap ? '📸' : (isSlow ? '⚡' : '');
        return `<div class="reel-seg-pill ${isSel ? 'active-seg' : ''}"
                     style="flex:${flexVal};"
                     title="Scene #${idx + 1}: ${escapeHtml(s.clip_filename)} (${d.toFixed(1)}s)"
                     onclick="selectStoryboardItem('${s.id}', true)">#${idx + 1}${icon}</div>`;
      }).join('');
    }

    function loadProjectIntoUI(proj, preserveSelection = true) {
      currentProject = proj;
      lastKnownVersion = proj.version || 1;

      if (proj.latest_export_url) {
        const hDl = document.getElementById('headerDownloadReelBtn');
        const tDl = document.getElementById('transportDownloadReelBtn');
        if (hDl) { hDl.href = proj.latest_export_url; hDl.style.display = 'inline-flex'; }
        if (tDl) { tDl.href = proj.latest_export_url; tDl.style.display = 'inline-flex'; }
      }

      const is169 = proj.aspect_ratio === '16:9';
      document.getElementById('btnRatio916').classList.toggle('btn-active', !is169);
      document.getElementById('btnRatio169').classList.toggle('btn-active', is169);
      const stageFrame = document.getElementById('stageFrame');
      stageFrame.classList.toggle('ratio-9-16', !is169);
      stageFrame.classList.toggle('ratio-16-9', is169);

      document.getElementById('defaultFitSelect').value = proj.default_fit_mode || 'blur_pad';
      document.getElementById('highlightModeSelect').value = proj.highlight_mode || 'instagram_cinematic';

      renderLibraryClips();
      renderStoryboardRibbon();
      renderReelProgressRibbon();
      updateSummaryTag();

      const curItem = getSelectedStoryboardItem();
      if (curItem) {
        selectStoryboardItem(curItem.id, false);
      } else {
        drawTrimmerCanvas();
      }
    }

    function updateSummaryTag() {
      if (!currentProject) return;
      const clips = currentProject.clips || [];
      const sb = currentProject.storyboard || [];
      const totalDur = sb.reduce((acc, s) => acc + getCutPlayDuration(s), 0);
      const scrapCount = sb.filter(s => !!(s.scrapbook_photo_id || s.scrapbook_photo_filepath)).length;
      const slowMoCount = sb.filter(s => (s.speed_mode || '1.0x') !== '1.0x').length;
      const unmutedCount = sb.filter(s => !s.muted && (s.volume_pct ?? 100) > 0).length;
      const audioTag = unmutedCount > 0 ? `🔊 Native Audio ON (${unmutedCount}/${sb.length})` : `🔇 Clips Muted`;
      document.getElementById('projectSummaryTag').textContent =
        `${sb.length} Video Cuts (${slowMoCount} Slow-Mo) + ${scrapCount} 📸 Scrapbook Flashes • ${totalDur.toFixed(1)}s Total • ${audioTag}`;
    }

    function renderLibraryClips() {
      const container = document.getElementById('libraryClipList');
      const clips = (currentProject && currentProject.clips) || [];
      const sb = (currentProject && currentProject.storyboard) || [];
      document.getElementById('clipCountLabel').textContent = clips.length;

      if (!clips.length) {
        container.innerHTML = `
          <div style="text-align:center; padding:26px 12px; color:var(--muted); font-size:12px;">
            No clips or photos loaded yet.<br><br>
            Drop your event videos or temple photos above, or place them in <code>reel_studio/input/clips/</code> and click <strong>🔄 Scan Folder</strong>.
          </div>`;
        return;
      }

      container.innerHTML = clips.map(c => {
        const isPhoto = c.media_type === 'photo';
        const typeBadge = isPhoto
          ? '<span class="badge badge-gold">📸 SCRAPBOOK PHOTO</span>'
          : `<span class="badge">${c.duration.toFixed(1)}s</span>`;
        const orientIcon = c.orientation === 'vertical' ? '📱 9:16' : '🖥️ 16:9';
        const usedCount = isPhoto
          ? sb.filter(s => s.scrapbook_photo_id === c.clip_id || s.clip_id === c.clip_id).length
          : sb.filter(s => s.clip_id === c.clip_id).length;
        return `
          <div class="lib-card">
            <img class="lib-thumb" src="${c.thumb_url}" alt="" />
            <div class="lib-info">
              <div class="lib-name" title="${escapeHtml(c.filename)}">${escapeHtml(c.filename)}</div>
              <div class="lib-meta">
                ${typeBadge}
                <span class="badge">${orientIcon}</span>
                <span class="badge badge-purple">${usedCount}x in Reel</span>
              </div>
              <div style="display:flex; gap:5px; margin-top:4px;">
                ${isPhoto
                  ? `<button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="attachScrapbookPhotoToSelected('${c.clip_id}')">🗂️ Pop-Up on Selected Cut</button>`
                  : `<button class="btn" style="padding:2px 7px; font-size:10.5px;" onclick="appendClipToStoryboard('${c.clip_id}')">➕ Add to Reel</button>`
                }
                <button class="btn" style="padding:2px 7px; font-size:10.5px; color:#f87171;" onclick="deleteClipFromProject('${c.clip_id}')">🗑</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function renderStoryboardRibbon() {
      const ribbon = document.getElementById('storyboardRibbon');
      const sb = (currentProject && currentProject.storyboard) || [];
      document.getElementById('sbCountLabel').textContent = sb.length;

      if (!sb.length) {
        ribbon.innerHTML = `
          <div style="color:var(--muted); font-size:12px; padding-left:10px;">
            Storyboard is empty — upload clips/photos or click <strong>✨ Build Cinematic Storyboard</strong>.
          </div>`;
        return;
      }

      ribbon.innerHTML = sb.map((item, idx) => {
        const isSelected = item.id === selectedSbId;
        const isPhoto = item.media_type === 'photo';
        const hasScrapbook = !!(item.scrapbook_photo_id || item.scrapbook_photo_filepath);
        const playDur = getCutPlayDuration(item);
        const spMode = item.speed_mode || '1.0x';
        const spBadge = isPhoto
          ? '📸 PHOTO'
          : (spMode === 'speed_ramp' ? '⚡ RAMP' : (spMode !== '1.0x' ? `🎬 ${spMode}` : '1.0x'));
        const volText = hasScrapbook ? '🗂️ +📸' : (item.muted ? '🎵' : `🔊 ${item.volume_pct}%`);
        const capText = hasScrapbook
          ? `📸 Pop: ${escapeHtml((item.scrapbook_photo_filename || 'Photo').replace(/^PHOTO_\d+_/, '').replace(/\.[^.]+$/, ''))}`
          : (item.overlay_text
            ? `🏷️ ${escapeHtml(item.overlay_text)}`
            : `⏱ ${item.in_sec.toFixed(1)}s–${item.out_sec.toFixed(1)}s`);

        return `
          <div class="sb-card ${isSelected ? 'active' : ''}"
               draggable="true"
               ondragstart="onSbDragStart(event, ${idx})"
               ondragover="onSbDragOver(event)"
               ondrop="onSbDrop(event, ${idx})"
               onclick="selectStoryboardItem('${item.id}', true)">
            <div class="sb-thumb-wrap">
              <img class="sb-thumb" src="${item.thumb_url}" alt="" />
              <span class="sb-idx-badge">#${idx + 1}</span>
              <span class="sb-speed-badge" style="${isPhoto ? 'background:rgba(245,158,11,0.92); color:#111;' : (spMode === '1.0x' ? 'background:rgba(30,30,45,0.85); color:#cbd5e1;' : '')}">${spBadge}</span>
              <span class="sb-vol-badge" style="${hasScrapbook ? 'background:rgba(245,158,11,0.92); color:#111; font-weight:800;' : ''}">${volText}</span>
              <span class="sb-dur-badge">${playDur.toFixed(1)}s</span>
            </div>
            <div class="sb-body">
              <div class="sb-title-row">
                <span class="sb-fname" title="${escapeHtml(item.clip_filename)}">${escapeHtml(item.clip_filename)}</span>
              </div>
              <div class="sb-caption-tag">${capText}</div>
              <div class="sb-actions" onclick="event.stopPropagation()">
                <div>
                  <button class="sb-icon-btn" onclick="moveSbItem(${idx}, -1)" title="Move Left">◀</button>
                  <button class="sb-icon-btn" onclick="moveSbItem(${idx}, 1)" title="Move Right">▶</button>
                </div>
                <div>
                  <button class="sb-icon-btn" onclick="duplicateSbAtIndex(${idx})" title="Reuse / Duplicate Cut">⧉</button>
                  <button class="sb-icon-btn" style="color:#f87171;" onclick="removeSbItem(${idx})" title="Remove Cut">✕</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    function selectStoryboardItem(sbId, autoSeek = true) {
      if (!currentProject || !currentProject.storyboard) return;
      const item = currentProject.storyboard.find(s => s.id === sbId);
      if (!item) return;

      // Check if standbyVideo already has this exact cut preloaded (instant zero-flash deck swap!)
      const standbyHasCut =
        preloadedSbId === item.id &&
        standbyVideo.src &&
        standbyVideo.src.endsWith(item.proxy_url) &&
        standbyVideo.readyState >= 2;

      if (standbyHasCut) {
        previewVideo.pause();
        previewVideo.muted = true;
        const oldActive = previewVideo;
        previewVideo = standbyVideo;
        standbyVideo = oldActive;
        previewVideo.classList.remove('standby-deck');
        previewVideo.classList.add('active-deck');
        standbyVideo.classList.remove('active-deck');
        standbyVideo.classList.add('standby-deck');
        if (autoSeek && Math.abs(previewVideo.currentTime - item.in_sec) > 0.12) {
          previewVideo.currentTime = item.in_sec;
        }
      } else {
        const needsSrcChange = !previewVideo.src || !previewVideo.src.endsWith(item.proxy_url);
        if (needsSrcChange) {
          previewVideo.src = item.proxy_url;
          previewVideo.currentTime = item.in_sec;
        } else if (autoSeek) {
          previewVideo.currentTime = item.in_sec;
        }
      }

      selectedSbId = item.id;
      renderStoryboardRibbon();
      renderReelProgressRibbon();
      populateInspectorFromItem(item);
      updatePreviewStageFraming(item);
      updateLiveStageOverlays(item);
      drawTrimmerCanvas();
      applyLiveClipAudioAndSpeed(item);

      // Immediately preload the NEXT cut on standbyVideo so the next transition is a 0ms hard cut!
      preloadNextCutOnStandby(item);

      const idx = currentProject.storyboard.indexOf(item);
      const playDur = getCutPlayDuration(item);
      document.getElementById('activeClipBanner').textContent =
        `Cut #${idx + 1}/${currentProject.storyboard.length}: ${item.clip_filename} [${item.in_sec.toFixed(1)}s–${item.out_sec.toFixed(1)}s @ ${item.speed_mode || '1.0x'} = ${playDur.toFixed(1)}s]`;
    }

    function updatePreviewStageFraming(item) {
      if (!item || !currentProject) return;
      const fitMode = (item.fit_mode === 'cover' || item.fit_mode === 'blur_pad')
        ? item.fit_mode
        : (currentProject.default_fit_mode || 'blur_pad');

      const isTargetVert = currentProject.aspect_ratio !== '16:9';
      const isClipVert = item.clip_orientation === 'vertical';
      const mismatch = isTargetVert !== isClipVert;

      const bgBlur = document.getElementById('stageBgBlur');
      if (fitMode === 'blur_pad' && mismatch) {
        bgBlur.style.backgroundImage = `url('${item.thumb_url}')`;
        bgBlur.classList.add('visible');
      } else {
        bgBlur.classList.remove('visible');
      }

      const deckClass = (previewVideo === previewVideoA) ? 'active-deck' : 'active-deck';
      previewVideo.className = `stage-video ${deckClass}`;
      if (!(fitMode === 'blur_pad' && mismatch) && fitMode === 'cover') {
        previewVideo.classList.add('fit-cover');
      }
      if (item.effect) {
        previewVideo.classList.add('fx-' + item.effect);
      }
      standbyVideo.className = 'stage-video standby-deck';
    }

    function updateLiveStageOverlays(item) {
      if (!currentProject) return;
      const gBadge = document.getElementById('stageGlobalBadge');
      const gTitle = (currentProject.global_title || '').trim();
      const gSub = (currentProject.global_subtitle || '').trim();
      const gMode = currentProject.global_banner_mode || 'intro_only';
      const idx = item ? currentProject.storyboard.indexOf(item) : 0;
      const showGlobal = (gTitle || gSub) && (gMode === 'all_clips' || (gMode === 'intro_only' && idx === 0));

      if (showGlobal) {
        document.getElementById('stageGlobalTitle').textContent = gTitle;
        document.getElementById('stageGlobalSub').textContent = gSub;
        gBadge.style.display = 'block';
      } else {
        gBadge.style.display = 'none';
      }

      // Live WYSIWYG Scrapbook Polaroid Pop-Up on Top of Playing Video
      const sbWrap = document.getElementById('stageScrapbookWrap');
      const sbCard = document.getElementById('stageScrapbookCard');
      const sbImg = document.getElementById('stageScrapbookImg');
      const sbTape = document.getElementById('stageScrapbookTape');
      const shutterEl = document.getElementById('stageShutterFlash');

      const hasScrapbook = item && !!(item.scrapbook_photo_url || item.scrapbook_photo_filename);
      if (!hasScrapbook) {
        sbWrap.classList.remove('visible');
        shutterEl.classList.remove('flash-on');
      } else {
        const mult = SPEED_MAP[item.speed_mode || '1.0x'] || 1.0;
        const relT = Math.max(0, (previewVideo.currentTime - item.in_sec) / mult);
        const playDur = getCutPlayDuration(item);
        const timing = item.scrapbook_timing || 'pop_after_1s';
        let popT = 0.0;
        let popEnd = playDur;
        if (timing === 'pop_after_1s') {
          popT = Math.min(0.95, Math.max(0.45, playDur * 0.24));
          popEnd = Math.min(playDur - 0.30, popT + 1.20);
        } else if (timing === 'pop_early') {
          popT = Math.min(0.65, Math.max(0.35, playDur * 0.18));
          popEnd = Math.min(playDur - 0.25, popT + 0.85);
        }

        const photoSrc = item.scrapbook_photo_filename
          ? `/clips_media/${encodeURIComponent(item.scrapbook_photo_filename)}`
          : item.scrapbook_photo_url;
        if (sbImg.getAttribute('src') !== photoSrc) {
          sbImg.setAttribute('src', photoSrc);
        }

        const styleMode = item.scrapbook_style || 'polaroid_tape';
        sbCard.className = `scrapbook-polaroid style-${styleMode}`;
        sbTape.style.display = (styleMode === 'polaroid_tape' || styleMode === 'vintage_print') ? 'block' : 'none';
        const tilt = parseFloat(item.scrapbook_tilt_deg ?? -3.0);

        // Show during playback only inside the short flash window [popT, popEnd], or while paused at cut start so user can inspect style/tilt
        const inFlashWindow = (relT >= popT && relT <= popEnd);
        const shouldShow = isPlayingReel ? inFlashWindow : (inFlashWindow || relT < 0.12);
        const shouldFlash = isPlayingReel && popT > 0.05 && (relT >= popT && relT <= popT + 0.14);

        shutterEl.classList.toggle('flash-on', shouldFlash);
        if (shouldShow) {
          sbWrap.classList.add('visible');
          const popProgress = isPlayingReel ? Math.min(1.0, (relT - popT) / 0.14) : 1.0;
          const scaleVal = 0.92 + 0.08 * popProgress;
          sbCard.style.transform = `rotate(${tilt}deg) scale(${scaleVal.toFixed(3)})`;
        } else {
          sbWrap.classList.remove('visible');
        }
      }

      const capBox = document.getElementById('stageCaptionBox');
      if (!item || (!(item.overlay_text || '').trim() && !(item.overlay_subtext || '').trim())) {
        capBox.style.display = 'none';
        return;
      }

      const relT = Math.max(0, previewVideo.currentTime - item.in_sec);
      if (item.overlay_timing === 'intro_3s' && relT > 3.0) {
        capBox.style.display = 'none';
        return;
      }

      document.getElementById('stageCaptionMain').textContent = item.overlay_text || '';
      document.getElementById('stageCaptionSub').textContent = item.overlay_subtext || '';
      capBox.className = `stage-caption-wrap pos-${item.overlay_position || 'bottom'} style-${item.overlay_style || 'temple_gold'} size-${item.overlay_size || 'medium'}`;
      capBox.style.display = 'block';
    }

    function populateInspectorFromItem(item) {
      const idx = currentProject.storyboard.indexOf(item);
      const srcDur = Math.max(0.2, item.out_sec - item.in_sec);
      const playDur = getCutPlayDuration(item);

      document.getElementById('inspClipBadge').textContent = `Cut #${idx + 1} • ${playDur.toFixed(1)}s`;
      document.getElementById('inspSpeedMode').value = item.speed_mode || '1.0x';
      document.getElementById('inspEffectiveDurLabel').textContent =
        `${srcDur.toFixed(1)}s slice ➜ ${playDur.toFixed(1)}s on screen`;

      // Populate Scrapbook Photo dropdown with all photo assets in project
      const photoClips = ((currentProject && currentProject.clips) || []).filter(c => c.media_type === 'photo');
      const sbSelect = document.getElementById('inspScrapbookPhoto');
      sbSelect.innerHTML = `<option value="">— None (Video Only) —</option>` +
        photoClips.map(p => `<option value="${p.clip_id}">📸 ${escapeHtml(p.filename)}</option>`).join('');
      sbSelect.value = item.scrapbook_photo_id || '';

      const hasScrap = !!(item.scrapbook_photo_id || item.scrapbook_photo_filepath);
      const sbBadge = document.getElementById('inspScrapbookBadge');
      sbBadge.textContent = hasScrap ? '🗂️ ACTIVE' : 'OFF';
      sbBadge.style.background = hasScrap ? 'rgba(245, 158, 11, 0.25)' : '#232334';

      document.getElementById('inspScrapbookStyle').value = item.scrapbook_style || 'polaroid_tape';
      document.getElementById('inspScrapbookTiming').value = item.scrapbook_timing || 'pop_after_1s';
      const tiltVal = parseFloat(item.scrapbook_tilt_deg ?? -3.0);
      document.getElementById('inspScrapbookTilt').value = tiltVal;
      document.getElementById('inspScrapbookTiltLabel').textContent = (tiltVal >= 0 ? '+' : '') + tiltVal.toFixed(1) + '°';

      document.getElementById('inspVolumeSlider').value = item.volume_pct ?? 100;
      document.getElementById('volPctLabel').textContent = (item.volume_pct ?? 100) + '%';
      document.getElementById('inspMuteCheck').checked = !!item.muted;

      document.getElementById('inspOverlayText').value = item.overlay_text || '';
      document.getElementById('inspOverlaySubtext').value = item.overlay_subtext || '';
      document.getElementById('inspOverlayPos').value = item.overlay_position || 'bottom';
      document.getElementById('inspOverlayStyle').value = item.overlay_style || 'temple_gold';
      document.getElementById('inspOverlaySize').value = item.overlay_size || 'medium';
      document.getElementById('inspOverlayTiming').value = item.overlay_timing || 'full';

      document.getElementById('inspFitMode').value = item.fit_mode || 'auto';
      document.getElementById('inspEffect').value = item.effect || 'cinematic_film';
      document.getElementById('inspTransition').value = item.transition || 'none';

      const clipObj = getClipById(item.clip_id);
      const hintEl = document.getElementById('inspTranscriptHint');
      if (clipObj && clipObj.transcript_text) {
        hintEl.textContent = '🗣️ Speech detected';
        hintEl.title = clipObj.transcript_text;
      } else {
        hintEl.textContent = '';
      }
    }

    function onInspectorScrapbookChange() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      const photoId = document.getElementById('inspScrapbookPhoto').value;
      if (!photoId) {
        item.scrapbook_photo_id = '';
        item.scrapbook_photo_filepath = '';
        item.scrapbook_photo_url = '';
        item.scrapbook_photo_filename = '';
      } else {
        const pClip = getClipById(photoId);
        if (pClip) {
          item.scrapbook_photo_id = pClip.clip_id;
          item.scrapbook_photo_filepath = pClip.filepath;
          item.scrapbook_photo_url = pClip.thumb_url;
          item.scrapbook_photo_filename = pClip.filename;
        }
      }
      item.scrapbook_style = document.getElementById('inspScrapbookStyle').value;
      item.scrapbook_timing = document.getElementById('inspScrapbookTiming').value;
      item.scrapbook_tilt_deg = parseFloat(document.getElementById('inspScrapbookTilt').value) || 0.0;
      document.getElementById('inspScrapbookTiltLabel').textContent =
        (item.scrapbook_tilt_deg >= 0 ? '+' : '') + item.scrapbook_tilt_deg.toFixed(1) + '°';

      populateInspectorFromItem(item);
      updateLiveStageOverlays(item);
      renderStoryboardRibbon();
       renderLibraryClips();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function attachScrapbookPhotoToSelected(photoClipId) {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      document.getElementById('inspScrapbookPhoto').value = photoClipId;
      onInspectorScrapbookChange();
      statusBanner.textContent = `🗂️ Attached Scrapbook Photo Pop-Up to Cut #${currentProject.storyboard.indexOf(item) + 1}!`;
    }

    function onInspectorAudioChange() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      item.volume_pct = parseInt(document.getElementById('inspVolumeSlider').value, 10) || 0;
      item.muted = document.getElementById('inspMuteCheck').checked;
      document.getElementById('volPctLabel').textContent = item.volume_pct + '%';
      applyLiveClipAudioAndSpeed(item);
      renderStoryboardRibbon();
      scheduleSaveStoryboard();
    }

    function applyVolumeToAllClips() {
      if (!currentProject || !currentProject.storyboard) return;
      const v = parseInt(document.getElementById('inspVolumeSlider').value, 10) || 100;
      const m = document.getElementById('inspMuteCheck').checked;
      currentProject.storyboard.forEach(s => {
        s.volume_pct = v;
        s.muted = m;
      });
      renderStoryboardRibbon();
      scheduleSaveStoryboard();
      statusBanner.textContent = `🔊 Applied ${m ? 'Muted' : v + '% native volume'} to all ${currentProject.storyboard.length} storyboard cuts!`;
    }

    function onInspectorOverlayChange() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      item.overlay_text = document.getElementById('inspOverlayText').value;
      item.overlay_subtext = document.getElementById('inspOverlaySubtext').value;
      item.overlay_position = document.getElementById('inspOverlayPos').value;
      item.overlay_style = document.getElementById('inspOverlayStyle').value;
      item.overlay_size = document.getElementById('inspOverlaySize').value;
      item.overlay_timing = document.getElementById('inspOverlayTiming').value;

      updateLiveStageOverlays(item);
      renderStoryboardRibbon();
      scheduleSaveStoryboard();
    }

    function applyCaptionPreset(mainTxt, subTxt) {
      document.getElementById('inspOverlayText').value = mainTxt;
      document.getElementById('inspOverlaySubtext').value = subTxt;
      onInspectorOverlayChange();
    }

    function ClearAllCaptionsInReel() {
      if (!currentProject || !currentProject.storyboard) return;
      currentProject.storyboard.forEach(s => {
        s.overlay_text = '';
        s.overlay_subtext = '';
      });
      document.getElementById('inspOverlayText').value = '';
      document.getElementById('inspOverlaySubtext').value = '';
      const cur = getSelectedStoryboardItem();
      if (cur) updateLiveStageOverlays(cur);
      renderStoryboardRibbon();
      scheduleSaveStoryboard();
    }

    function clearClipOverlayText() {
      document.getElementById('inspOverlayText').value = '';
      document.getElementById('inspOverlaySubtext').value = '';
      onInspectorOverlayChange();
    }

    function onInspectorLookChange() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      item.speed_mode = document.getElementById('inspSpeedMode').value;
      item.fit_mode = document.getElementById('inspFitMode').value;
      item.effect = document.getElementById('inspEffect').value;
      item.transition = document.getElementById('inspTransition').value;
      populateInspectorFromItem(item);
      applyLiveClipAudioAndSpeed(item);
      updatePreviewStageFraming(item);
      renderStoryboardRibbon();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function togglePlayReel() {
      ensureWebAudioBoost();
      const item = getSelectedStoryboardItem();
      if (!item) return;

      if (isPlayingReel) {
        pauseReelPlayback();
      } else {
        isPlayingReel = true;
        document.getElementById('playPauseBtn').textContent = '⏸ Pause Reel';
        if (previewVideo.currentTime < item.in_sec || previewVideo.currentTime >= item.out_sec - 0.05) {
          previewVideo.currentTime = item.in_sec;
        }
        applyLiveClipAudioAndSpeed(item);
        previewVideo.play();
        if (currentProject && currentProject.bg_music_enabled && currentProject.bg_music_url) {
          bgAudioEl.play().catch(() => {});
        }
        requestAnimationFrame(reelPlaybackTick);
      }
    }

    function pauseReelPlayback() {
      isPlayingReel = false;
      previewVideo.pause();
      bgAudioEl.pause();
      document.getElementById('playPauseBtn').textContent = '▶ Play Full Reel';
    }

    function toggleLoopCurrentClip() {
      loopCurrentClip = !loopCurrentClip;
      document.getElementById('loopClipBtn').classList.toggle('btn-active', loopCurrentClip);
    }

    function reelPlaybackTick() {
      if (!isPlayingReel) return;
      const item = getSelectedStoryboardItem();
      if (!item) {
        pauseReelPlayback();
        return;
      }

      // Live Speed-Ramp modulation if item.speed_mode === 'speed_ramp'
      if (item.speed_mode === 'speed_ramp') {
        const span = Math.max(0.3, item.out_sec - item.in_sec);
        const prog = Math.max(0, Math.min(1, (previewVideo.currentTime - item.in_sec) / span));
        // Fast entry (1.30x) -> Dramatic Slow-Mo (0.52x) in middle -> Smooth exit (1.15x)
        const rate = (prog < 0.25) ? 1.28 : ((prog < 0.78) ? 0.54 : 1.15);
        previewVideo.playbackRate = rate;
      }

      updateLiveStageOverlays(item);
      drawTrimmerCanvas();
      updateTimecodeReadout(item);

      if (previewVideo.currentTime >= item.out_sec - 0.04 || previewVideo.ended) {
        if (loopCurrentClip) {
          previewVideo.currentTime = item.in_sec;
          previewVideo.play();
        } else {
          const sb = currentProject.storyboard || [];
          const curIdx = sb.indexOf(item);
          if (curIdx >= 0 && curIdx < sb.length - 1) {
            const nextItem = sb[curIdx + 1];
            selectStoryboardItem(nextItem.id, true);
            previewVideo.play();
          } else {
            selectStoryboardItem(sb[0].id, true);
            pauseReelPlayback();
            return;
          }
        }
      }
      requestAnimationFrame(reelPlaybackTick);
    }

    function updateTimecodeReadout(item) {
      if (!currentProject || !currentProject.storyboard || !item) return;
      const sb = currentProject.storyboard;
      let elapsedBefore = 0;
      let totalReel = 0;
      for (const s of sb) {
        const d = getCutPlayDuration(s);
        if (s.id === item.id) {
          elapsedBefore = totalReel;
        }
        totalReel += d;
      }
      const mult = SPEED_MAP[item.speed_mode || '1.0x'] || 1.0;
      const curInClip = Math.max(0, Math.min(item.out_sec - item.in_sec, previewVideo.currentTime - item.in_sec)) / mult;
      const curTotal = elapsedBefore + curInClip;
      document.getElementById('timecodeDisplay').textContent =
        `${formatSec(curTotal)} / ${formatSec(totalReel)}`;
    }

    function formatSec(sec) {
      const m = Math.floor(sec / 60);
      const s = (sec % 60).toFixed(1).padStart(4, '0');
      return `${String(m).padStart(2, '0')}:${s}`;
    }

    function drawTrimmerCanvas() {
      const ctx = trimCanvas.getContext('2d');
      const w = trimCanvas.width;
      const h = trimCanvas.height;
      ctx.clearRect(0, 0, w, h);

      const item = getSelectedStoryboardItem();
      if (!item) return;
      const clipObj = getClipById(item.clip_id);
      const dur = Math.max(0.2, item.clip_duration || (clipObj ? clipObj.duration : 5.0));

      const visCurve = (clipObj && clipObj.visual_curve) || [0.8];
      const audCurve = (clipObj && clipObj.audio_curve) || [0.6];
      const nBins = visCurve.length;

      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i < nBins; i++) {
        const x = (i / Math.max(1, nBins - 1)) * w;
        const val = Math.min(1.8, visCurve[i] || 0.5) / 1.8;
        const y = h - val * (h - 10) - 2;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.fill();

      ctx.beginPath();
      for (let i = 0; i < audCurve.length; i++) {
        const x = (i / Math.max(1, audCurve.length - 1)) * w;
        const val = Math.min(1.8, audCurve[i] || 0.4) / 1.8;
        const y = h - val * (h - 12) - 3;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Highlight other cuts from this same clip on the timeline in faint purple so user sees reused parts!
      if (currentProject && currentProject.storyboard) {
        for (const other of currentProject.storyboard) {
          if (other.clip_id === item.clip_id && other.id !== item.id) {
            const ox0 = (other.in_sec / dur) * w;
            const ox1 = (other.out_sec / dur) * w;
            ctx.fillStyle = 'rgba(139, 92, 246, 0.22)';
            ctx.fillRect(ox0, 0, Math.max(3, ox1 - ox0), h);
          }
        }
      }

      const inX = (item.in_sec / dur) * w;
      const outX = (item.out_sec / dur) * w;
      ctx.fillStyle = 'rgba(5, 5, 10, 0.62)';
      ctx.fillRect(0, 0, inX, h);
      ctx.fillRect(outX, 0, w - outX, h);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(inX, 1, Math.max(4, outX - inX), h - 2);

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(inX - 4, 0, 8, h);
      ctx.fillRect(outX - 4, 0, 8, h);

      const curT = previewVideo.currentTime || item.in_sec;
      const playX = Math.max(inX, Math.min(outX, (curT / dur) * w));
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
    }

    trimCanvas.addEventListener('mousedown', (e) => {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      const rect = trimCanvas.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * trimCanvas.width;
      const dur = Math.max(0.2, item.clip_duration);
      const inX = (item.in_sec / dur) * trimCanvas.width;
      const outX = (item.out_sec / dur) * trimCanvas.width;

      if (Math.abs(x - inX) <= 14) {
        dragHandle = 'in';
      } else if (Math.abs(x - outX) <= 14) {
        dragHandle = 'out';
      } else {
        dragHandle = 'playhead';
        const newT = Math.max(0, Math.min(dur, (x / trimCanvas.width) * dur));
        previewVideo.currentTime = newT;
        drawTrimmerCanvas();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragHandle) return;
      const item = getSelectedStoryboardItem();
      if (!item) return;
      const rect = trimCanvas.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const dur = Math.max(0.2, item.clip_duration);
      const t = ratio * dur;

      if (dragHandle === 'in') {
        item.in_sec = Math.round(Math.min(t, item.out_sec - 0.5) * 20) / 20;
        item.note_tag = 'custom_trim';
        previewVideo.currentTime = item.in_sec;
      } else if (dragHandle === 'out') {
        item.out_sec = Math.round(Math.max(t, item.in_sec + 0.5) * 20) / 20;
        item.note_tag = 'custom_trim';
        previewVideo.currentTime = Math.max(item.in_sec, item.out_sec - 0.3);
      } else if (dragHandle === 'playhead') {
        previewVideo.currentTime = Math.max(item.in_sec, Math.min(item.out_sec, t));
      }
      drawTrimmerCanvas();
      populateInspectorFromItem(item);
      renderStoryboardRibbon();
      updateSummaryTag();
    });

    window.addEventListener('mouseup', () => {
      if (dragHandle) {
        dragHandle = null;
        scheduleSaveStoryboard();
      }
    });

    function snapSelectedToPeak() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      const clipObj = getClipById(item.clip_id);
      if (!clipObj) return;
      item.in_sec = clipObj.best_in_sec;
      item.out_sec = clipObj.best_out_sec;
      item.note_tag = 'peak_highlight';
      previewVideo.currentTime = item.in_sec;
      drawTrimmerCanvas();
      renderStoryboardRibbon();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function snapSelectedToSpeech() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      const clipObj = getClipById(item.clip_id);
      if (!clipObj || !clipObj.speech_segments || !clipObj.speech_segments.length) {
        alert('No spoken segment detected in this clip.');
        return;
      }
      const sp = clipObj.speech_segments.reduce((a, b) => ((b.end - b.start) > (a.end - a.start) ? b : a));
      item.in_sec = Math.max(0, Math.round((sp.start - 0.25) * 10) / 10);
      item.out_sec = Math.min(clipObj.duration, Math.round((sp.end + 0.35) * 10) / 10);
      item.note_tag = 'spoken_moment';
      previewVideo.currentTime = item.in_sec;
      drawTrimmerCanvas();
      renderStoryboardRibbon();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function expandSelectedFullClip() {
      const item = getSelectedStoryboardItem();
      if (!item) return;
      item.in_sec = 0.0;
      item.out_sec = item.clip_duration;
      item.note_tag = 'full_clip';
      previewVideo.currentTime = 0.0;
      drawTrimmerCanvas();
      renderStoryboardRibbon();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function splitSelectedClipAtPlayhead() {
      const item = getSelectedStoryboardItem();
      if (!item || !currentProject) return;
      const splitT = Math.round(previewVideo.currentTime * 20) / 20;
      if (splitT <= item.in_sec + 0.5 || splitT >= item.out_sec - 0.5) {
        alert('Move the playhead inside the trimmed highlight region (at least 0.5s from IN/OUT) to split.');
        return;
      }
      const idx = currentProject.storyboard.indexOf(item);
      const clone = JSON.parse(JSON.stringify(item));
      clone.id = 'sb_' + Date.now() + '_split';
      clone.in_sec = splitT;
      item.out_sec = splitT;

      currentProject.storyboard.splice(idx + 1, 0, clone);
      currentProject.storyboard.forEach((s, i) => s.index = i);
      renderStoryboardRibbon();
      drawTrimmerCanvas();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function duplicateSelectedClip() {
      const item = getSelectedStoryboardItem();
      if (!item || !currentProject) return;
      const idx = currentProject.storyboard.indexOf(item);
      duplicateSbAtIndex(idx);
    }

    function duplicateSbAtIndex(idx) {
      if (!currentProject || !currentProject.storyboard[idx]) return;
      const orig = currentProject.storyboard[idx];
      const copy = JSON.parse(JSON.stringify(orig));
      copy.id = 'sb_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      // Advance window to a different part of the clip if possible!
      const span = Math.max(1.8, orig.out_sec - orig.in_sec);
      if (orig.out_sec + span + 1.0 <= orig.clip_duration) {
        copy.in_sec = Math.round((orig.out_sec + 1.0) * 10) / 10;
        copy.out_sec = Math.round((copy.in_sec + span) * 10) / 10;
      } else if (orig.in_sec - span - 1.0 >= 0) {
        copy.in_sec = Math.round(Math.max(0, orig.in_sec - span - 1.0) * 10) / 10;
        copy.out_sec = Math.round((copy.in_sec + span) * 10) / 10;
      }
      currentProject.storyboard.splice(idx + 1, 0, copy);
      currentProject.storyboard.forEach((s, i) => s.index = i);
      selectedSbId = copy.id;
      renderStoryboardRibbon();
      renderLibraryClips();
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    function moveSbItem(idx, delta) {
      if (!currentProject || !currentProject.storyboard) return;
      const sb = currentProject.storyboard;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= sb.length) return;
      const [moved] = sb.splice(idx, 1);
      sb.splice(targetIdx, 0, moved);
      sb.forEach((s, i) => s.index = i);
      renderStoryboardRibbon();
      scheduleSaveStoryboard();
    }

    function removeSbItem(idx) {
      if (!currentProject || !currentProject.storyboard) return;
      currentProject.storyboard.splice(idx, 1);
      currentProject.storyboard.forEach((s, i) => s.index = i);
      if (currentProject.storyboard.length) {
        selectedSbId = currentProject.storyboard[Math.min(idx, currentProject.storyboard.length - 1)].id;
      } else {
        selectedSbId = null;
      }
      loadProjectIntoUI(currentProject, true);
      scheduleSaveStoryboard();
    }

    function onSbDragStart(e, idx) {
      draggedCardIdx = idx;
      e.currentTarget.classList.add('dragging');
    }
    function onSbDragOver(e) {
      e.preventDefault();
    }
    function onSbDrop(e, dropIdx) {
      e.preventDefault();
      if (draggedCardIdx === null || draggedCardIdx === dropIdx || !currentProject) return;
      const sb = currentProject.storyboard;
      const [moved] = sb.splice(draggedCardIdx, 1);
      sb.splice(dropIdx, 0, moved);
      sb.forEach((s, i) => s.index = i);
      draggedCardIdx = null;
      renderStoryboardRibbon();
      scheduleSaveStoryboard();
    }

    function stepStoryboard(delta) {
      if (!currentProject || !currentProject.storyboard || !currentProject.storyboard.length) return;
      const sb = currentProject.storyboard;
      const cur = getSelectedStoryboardItem();
      const idx = cur ? sb.indexOf(cur) : 0;
      const nextIdx = (idx + delta + sb.length) % sb.length;
      selectStoryboardItem(sb[nextIdx].id, true);
    }

    function scheduleSaveStoryboard() {
      if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
      saveDebounceTimer = setTimeout(async () => {
        if (!currentProject) return;
        await fetch('/api/update_project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            aspect_ratio: currentProject.aspect_ratio,
            default_fit_mode: currentProject.default_fit_mode,
            highlight_mode: currentProject.highlight_mode,
            storyboard: currentProject.storyboard,
          }),
        });
      }, 220);
    }

    async function setAspectRatio(ratio) {
      if (!currentProject) return;
      currentProject.aspect_ratio = ratio;
      loadProjectIntoUI(currentProject, true);
      scheduleSaveStoryboard();
    }

    function updateProjectSettings() {
      if (!currentProject) return;
      currentProject.default_fit_mode = document.getElementById('defaultFitSelect').value;
      currentProject.highlight_mode = document.getElementById('highlightModeSelect').value;
      const cur = getSelectedStoryboardItem();
      if (cur) updatePreviewStageFraming(cur);
      updateSummaryTag();
      scheduleSaveStoryboard();
    }

    async function autoPickHighlights() {
      const mode = document.getElementById('highlightModeSelect').value;
      statusBanner.textContent = `✨ Weaving Multi-Scene Cinematic Storyboard (${mode})...`;
      const res = await fetch('/api/auto_highlights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ highlight_mode: mode }),
      });
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project, false);
        statusBanner.textContent = `✨ Built ${data.project.storyboard.length}-cut Multi-Scene Cinematic Storyboard with Slow-Mo & interleaved scenes!`;
      }
    }

    async function sortStoryboard(orderBy) {
      const res = await fetch('/api/sort_storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_by: orderBy }),
      });
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project, true);
      }
    }

    async function appendClipToStoryboard(clipId) {
      const res = await fetch('/api/append_clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: clipId }),
      });
      const data = await res.json();
      if (data.project) {
        if (data.new_item) selectedSbId = data.new_item.id;
        loadProjectIntoUI(data.project, true);
      }
    }

    async function deleteClipFromProject(clipId) {
      const res = await fetch('/api/delete_clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clip_id: clipId }),
      });
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project, true);
      }
    }

    const dropzone = document.getElementById('clipDropzone');
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        uploadSelectedFiles(e.dataTransfer.files);
      }
    });

    async function uploadSelectedFiles(fileList) {
      if (!fileList || !fileList.length) return;
      const fd = new FormData();
      for (const f of fileList) {
        fd.append('clips', f);
      }
      statusBanner.textContent = `🚀 Uploading ${fileList.length} video clip(s) & spawning parallel analysis agents...`;
      toggleAgentsDrawer(true);

      const res = await fetch('/api/upload_clips', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      statusBanner.textContent = `🤖 Spawned ${data.spawned_count} parallel Clip Analysis Agents!`;
      pollAgentsTelemetry();
    }

    async function syncClipsFolder() {
      statusBanner.textContent = '🔄 Scanning input/clips/ and spawning parallel analysis agents...';
      toggleAgentsDrawer(true);
      const res = await fetch('/api/scan_folder', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        statusBanner.textContent = '⚠️ ' + data.error;
        return;
      }
      statusBanner.textContent = `🤖 Spawned ${data.spawned_count} parallel Clip Analysis Agents from input/clips/!`;
      pollAgentsTelemetry();
    }

    function openMusicBannerModal() {
      if (!currentProject) return;
      document.getElementById('modalGlobalTitle').value = currentProject.global_title || '';
      document.getElementById('modalGlobalSubtitle').value = currentProject.global_subtitle || '';
      document.getElementById('modalGlobalMode').value = currentProject.global_banner_mode || 'intro_only';
      document.getElementById('modalBgEnabled').checked = !!currentProject.bg_music_enabled;
      document.getElementById('modalBgDucking').checked = currentProject.bg_music_ducking !== false;
      document.getElementById('modalBgVolSlider').value = currentProject.bg_music_volume_pct || 22;
      document.getElementById('modalBgVolLabel').textContent = (currentProject.bg_music_volume_pct || 22) + '%';
      document.getElementById('bgMusicCurrentLabel').textContent = currentProject.bg_music_filename
        ? `🎵 Loaded: ${currentProject.bg_music_filename}`
        : 'No background music loaded (100% original clip audio only)';
      document.getElementById('musicBannerModal').style.display = 'flex';
    }

    function closeMusicBannerModal() {
      document.getElementById('musicBannerModal').style.display = 'none';
    }

    async function uploadBgMusicNow() {
      const inp = document.getElementById('bgMusicFileInput');
      if (!inp.files || !inp.files[0]) {
        alert('Select an audio file (.mp3, .wav, .m4a) first.');
        return;
      }
      const fd = new FormData();
      fd.append('music', inp.files[0]);
      const res = await fetch('/api/upload_music', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      currentProject = data.project;
      document.getElementById('modalBgEnabled').checked = true;
      document.getElementById('bgMusicCurrentLabel').textContent = `🎵 Loaded: ${currentProject.bg_music_filename}`;
      updateSummaryTag();
    }

    async function saveMusicBannerSettings() {
      if (!currentProject) return;
      const payload = {
        global_title: document.getElementById('modalGlobalTitle').value,
        global_subtitle: document.getElementById('modalGlobalSubtitle').value,
        global_banner_mode: document.getElementById('modalGlobalMode').value,
        bg_music_enabled: document.getElementById('modalBgEnabled').checked,
        bg_music_ducking: document.getElementById('modalBgDucking').checked,
        bg_music_volume_pct: parseInt(document.getElementById('modalBgVolSlider').value, 10) || 22,
      };
      const res = await fetch('/api/update_project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project, true);
      }
      closeMusicBannerModal();
    }

    async function exportReelNow() {
      if (!currentProject || !currentProject.storyboard || !currentProject.storyboard.length) {
        alert('Add at least one clip to the storyboard before exporting.');
        return;
      }
      pauseReelPlayback();
      const btn = document.getElementById('exportBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Rendering 1080p MP4...';
      toggleAgentsDrawer(true);
      statusBanner.textContent = '🎬 Parallel VideoToolbox Render Agents exporting 1080p Cinematic Reel with Slow-Mo & Native Audio...';

      try {
        const res = await fetch('/api/export', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Export failed');

        const expVid = document.getElementById('exportedVideoPlayer');
        expVid.src = data.video_url + '?t=' + Date.now();
        document.getElementById('exportedPathLabel').textContent = 'Saved to: ' + data.output_path;
        document.getElementById('exportDownloadLink').href = data.video_url;
        const hDl = document.getElementById('headerDownloadReelBtn');
        const tDl = document.getElementById('transportDownloadReelBtn');
        if (hDl) { hDl.href = data.video_url; hDl.style.display = 'inline-flex'; }
        if (tDl) { tDl.href = data.video_url; tDl.style.display = 'inline-flex'; }
        document.getElementById('exportModal').style.display = 'flex';
        statusBanner.textContent = `✅ Exported 1080p Cinematic Reel to ${data.output_path}!`;
      } catch (err) {
        alert('Export error: ' + err.message);
        statusBanner.textContent = '❌ Export error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Export 1080p MP4';
      }
    }

    function toggleAgentsDrawer(forceState) {
      const dr = document.getElementById('agentsDrawer');
      if (typeof forceState === 'boolean') {
        dr.style.display = forceState ? 'flex' : 'none';
      } else {
        dr.style.display = dr.style.display === 'flex' ? 'none' : 'flex';
      }
    }

    async function pollAgentsTelemetry() {
      try {
        const res = await fetch('/api/agents_status');
        const data = await res.json();
        const agents = data.agents || [];
        const runningCount = agents.filter(a => a.state === 'running').length;
        document.getElementById('agentCountBadge').textContent = runningCount > 0 ? `${runningCount} active` : agents.length;

        const listEl = document.getElementById('agentsList');
        if (!agents.length) {
          listEl.innerHTML = `<div style="color:var(--muted); font-size:11.5px; text-align:center; padding:12px;">No active background agents.</div>`;
        } else {
          listEl.innerHTML = agents.map(a => `
            <div class="agent-item">
              <div style="display:flex; justify-content:space-between; font-weight:700; margin-bottom:2px;">
                <span>${escapeHtml(a.name)}</span>
                <span style="color:var(--gold-light);">${a.pct}% (${a.elapsed_sec}s)</span>
              </div>
              <div style="font-size:10.5px; color:var(--muted);">${escapeHtml(a.stage)}</div>
              <div class="progress-track">
                <div class="progress-fill" style="width:${a.pct}%"></div>
              </div>
            </div>
          `).join('');
        }

        if (data.project_version && data.project_version > lastKnownVersion) {
          const pRes = await fetch('/api/project');
          const pData = await pRes.json();
          if (pData.project) {
            loadProjectIntoUI(pData.project, true);
          }
        }
      } catch (e) {}
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayReel();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepStoryboard(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepStoryboard(1);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        toggleLoopCurrentClip();
      }
    });

    window.addEventListener('DOMContentLoaded', async () => {
      const res = await fetch('/api/project');
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project, false);
      }
      setInterval(pollAgentsTelemetry, 1000);
    });
  </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE)


@app.route("/proxies/<path:filename>")
def serve_proxy(filename):
    return send_from_directory(str(PROXY_DIR), filename)


@app.route("/clips_media/<path:filename>")
def serve_clips_media(filename):
    return send_from_directory(str(CLIPS_DIR), filename)


@app.route("/music_media/<path:filename>")
def serve_music(filename):
    return send_from_directory(str(MUSIC_DIR), filename)


@app.route("/output/<path:filename>")
def serve_output(filename):
    return send_from_directory(str(OUT_DIR), filename)


@app.route("/api/project", methods=["GET"])
def api_get_project():
    proj = load_project_state()
    if not proj.get("latest_export_url"):
        mp4s = sorted(OUT_DIR.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        if mp4s:
            proj["latest_export_url"] = f"/output/{mp4s[0].name}"
    return jsonify({"project": proj})


@app.route("/api/agents_status", methods=["GET"])
def api_agents_status():
    now = time.time()
    with AGENTS_LOCK:
        recent = [
            {
                **a,
                "elapsed_sec": round(
                    (now - a["started_at"]) if a["state"] == "running" else a["elapsed_sec"], 1
                ),
            }
            for a in ACTIVE_AGENTS.values()
            if a["state"] == "running" or (now - a["updated_at"]) <= 90.0
        ]
    recent.sort(key=lambda x: (0 if x["state"] == "running" else 1, -x["started_at"]))
    return jsonify({
        "agents": recent,
        "project_version": PROJECT_VERSION,
    })


@app.route("/api/upload_clips", methods=["POST"])
def api_upload_clips():
    try:
        ensure_ffmpeg()
        uploaded = [f for f in request.files.getlist("clips") if f and f.filename]
        if not uploaded:
            return jsonify({"error": "No video files selected."}), 400

        proj = load_project_state()
        base_idx = len(proj.get("clips", []))
        agent_ids = []

        for offset_i, f in enumerate(uploaded, 1):
            cname = secure_filename(f.filename)
            cpath = str(CLIPS_DIR / cname)
            f.save(cpath)
            aid = spawn_event_clip_agent(cpath, cname, base_idx + offset_i, auto_append_storyboard=True)
            agent_ids.append(aid)

        return jsonify({
            "ok": True,
            "spawned_count": len(agent_ids),
            "agent_ids": agent_ids,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/scan_folder", methods=["POST"])
def api_scan_folder():
    try:
        ensure_ffmpeg()
        clip_paths = [
            str(p) for p in sorted(CLIPS_DIR.iterdir())
            if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in MEDIA_EXTS
        ]
        if not clip_paths:
            return jsonify({
                "error": "No video or photo files (.mp4, .mov, .jpg, .png, .heic) found in reel_studio/input/clips/."
            }), 400

        agent_ids = []
        for idx, cpath in enumerate(clip_paths, 1):
            cname = os.path.basename(cpath)
            aid = spawn_event_clip_agent(cpath, cname, idx, auto_append_storyboard=True)
            agent_ids.append(aid)

        return jsonify({
            "ok": True,
            "spawned_count": len(agent_ids),
            "agent_ids": agent_ids,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload_music", methods=["POST"])
def api_upload_music():
    try:
        f = request.files.get("music")
        if not f or not f.filename:
            return jsonify({"error": "No audio file selected."}), 400
        mname = secure_filename(f.filename)
        mpath = str(MUSIC_DIR / mname)
        f.save(mpath)

        proj = load_project_state()
        proj["bg_music_filename"] = mname
        proj["bg_music_filepath"] = mpath
        proj["bg_music_url"] = f"/music_media/{mname}"
        proj["bg_music_enabled"] = True
        save_project_state(proj)
        return jsonify({"project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update_project", methods=["POST"])
def api_update_project():
    try:
        proj = load_project_state()
        body = request.get_json(force=True) or {}
        for k in (
            "title",
            "subtitle",
            "aspect_ratio",
            "default_fit_mode",
            "highlight_mode",
            "global_title",
            "global_subtitle",
            "global_banner_mode",
            "bg_music_enabled",
            "bg_music_ducking",
            "bg_music_volume_pct",
            "storyboard",
        ):
            if k in body:
                proj[k] = body[k]
        save_project_state(proj)
        return jsonify({"ok": True, "project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/auto_highlights", methods=["POST"])
def api_auto_highlights():
    try:
        proj = load_project_state()
        body = request.get_json(silent=True) or {}
        mode = body.get("highlight_mode") or proj.get("highlight_mode", "instagram_cinematic")
        proj["highlight_mode"] = mode

        clips = [dict_to_clip(c) for c in proj.get("clips", [])]
        sb_items = build_cinematic_instagram_storyboard(
            clips=clips,
            proxy_dir=PROXY_DIR,
            mode=mode,
            default_fit_mode=proj.get("default_fit_mode", "blur_pad"),
        )

        proj["storyboard"] = [dataclasses.asdict(s) for s in sb_items]
        save_project_state(proj)
        return jsonify({"project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sort_storyboard", methods=["POST"])
def api_sort_storyboard():
    try:
        proj = load_project_state()
        body = request.get_json(silent=True) or {}
        order_by = body.get("order_by", "chronological")
        sb_items = [dict_to_storyboard_item(s) for s in proj.get("storyboard", [])]

        if order_by == "energy":
            sb_items.sort(key=lambda s: (-s.highlight_score, s.clip_filename.lower()))
        else:
            sb_items.sort(key=lambda s: (s.clip_filename.lower(), s.in_sec))

        for i, s in enumerate(sb_items):
            s.index = i
        proj["storyboard"] = [dataclasses.asdict(s) for s in sb_items]
        save_project_state(proj)
        return jsonify({"project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/append_clip", methods=["POST"])
def api_append_clip():
    try:
        proj = load_project_state()
        body = request.get_json(force=True) or {}
        clip_id = body.get("clip_id")
        clips = [dict_to_clip(c) for c in proj.get("clips", [])]
        target = next((c for c in clips if c.clip_id == clip_id), None)
        if not target:
            return jsonify({"error": "Clip not found"}), 404

        sb_items = [dict_to_storyboard_item(s) for s in proj.get("storyboard", [])]
        existing_for_clip = [s for s in sb_items if s.clip_id == clip_id]

        new_item = make_storyboard_item_from_clip(
            clip=target,
            index=len(sb_items),
            highlight_mode=proj.get("highlight_mode", "instagram_cinematic"),
            default_fit_mode=proj.get("default_fit_mode", "blur_pad"),
        )
        # If this clip is already in the storyboard, pick a different non-overlapping region!
        if existing_for_clip and target.duration > 8.0:
            used_ranges = [(s.in_sec, s.out_sec) for s in existing_for_clip]
            win_len = 2.6
            for cand_t in [target.duration * 0.15, target.duration * 0.50, target.duration * 0.78]:
                c_in = round(max(0.2, min(cand_t, target.duration - win_len - 0.2)), 2)
                c_out = round(c_in + win_len, 2)
                if all(abs(c_in - u0) > 2.2 for u0, _ in used_ranges):
                    new_item.in_sec = c_in
                    new_item.out_sec = c_out
                    th = ensure_clip_thumbnail(target.filepath, PROXY_DIR, target.clip_id, 0.5 * (c_in + c_out))
                    new_item.thumb_url = f"/proxies/{th}"
                    break

        sb_items.append(new_item)
        proj["storyboard"] = [dataclasses.asdict(s) for s in sb_items]
        save_project_state(proj)
        return jsonify({"project": proj, "new_item": dataclasses.asdict(new_item)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete_clip", methods=["POST"])
def api_delete_clip():
    try:
        proj = load_project_state()
        body = request.get_json(force=True) or {}
        clip_id = body.get("clip_id")
        clips = [dict_to_clip(c) for c in proj.get("clips", [])]
        target = next((c for c in clips if c.clip_id == clip_id), None)
        if target and os.path.exists(target.filepath):
            try:
                os.remove(target.filepath)
            except Exception:
                pass

        rem_clips = [c for c in clips if c.clip_id != clip_id]
        rem_sb = [
            dict_to_storyboard_item(s)
            for s in proj.get("storyboard", [])
            if s.get("clip_id") != clip_id
        ]
        for i, s in enumerate(rem_sb):
            s.index = i

        proj["clips"] = [dataclasses.asdict(c) for c in rem_clips]
        proj["storyboard"] = [dataclasses.asdict(s) for s in rem_sb]
        save_project_state(proj)
        return jsonify({"project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export", methods=["POST"])
def api_export():
    try:
        proj_dict = load_project_state()
        proj = dict_to_project(proj_dict)
        if not proj.storyboard:
            return jsonify({"error": "Storyboard is empty."}), 400

        ratio_tag = "vertical_9x16" if proj.aspect_ratio != "16:9" else "horizontal_16x9"
        out_name = f"event_recap_{ratio_tag}_{int(time.time())}.mp4"
        out_path = str(OUT_DIR / out_name)

        export_agent_id = f"export_{int(time.time() * 1000)}"
        update_agent_status(
            export_agent_id,
            f"Export Swarm ({len(proj.storyboard)} cuts)",
            f"VideoToolbox 1080p ({proj.aspect_ratio}) + Slow-Mo + Native Audio",
            "🚀 Starting parallel storyboard segment renders...",
            5,
            "running",
        )

        def _exp_cb(stage_msg: str, pct_val: int):
            update_agent_status(
                export_agent_id,
                f"Export Swarm ({len(proj.storyboard)} cuts)",
                f"VideoToolbox 1080p ({proj.aspect_ratio}) + Slow-Mo + Native Audio",
                stage_msg,
                pct_val,
                "done" if pct_val >= 100 else "running",
            )

        render_recap_reel(
            project=proj,
            output_path=out_path,
            fps=30,
            progress_cb=_exp_cb,
        )
        return jsonify({
            "video_url": f"/output/{out_name}",
            "output_path": out_path,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("🏛️ Reel Studio v2 (Cinematic Multi-Scene Event Editor) running on http://127.0.0.1:5055")
    app.run(host="127.0.0.1", port=5055, debug=False, threaded=True)
