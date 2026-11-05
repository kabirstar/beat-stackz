#!/usr/bin/env python3
"""
Clipper Studio v6 — Parallel Agent Swarm Orchestrator & Interactive Editor
- Spins off parallel background agents (`AGENT_POOL`) for every uploaded video clip:
    * Each clip gets its own dedicated Sync Agent (`🤖 Sync Agent: <filename>`)
    * Inside each agent, Hardware Proxy Encoding (`h264_videotoolbox`), WAV Extraction,
      4Hz Visual Motion Scoring, Whisper Lyric Transcription, and Audalign Acoustic Matching
      run concurrently!
    * As each individual agent finishes, it immediately streams that clip onto the live timeline
      without waiting for slower clips to finish.
- Caches Master Song acoustic & lyric features in RAM (`CACHED_SONG_INFO`) so new clip agents
  begin syncing instantaneously with zero song re-analysis overhead.
"""

from __future__ import annotations

import concurrent.futures
import dataclasses
import json
import os
import subprocess
import tempfile
import threading
import time
from pathlib import Path
from typing import Dict, Any, List
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory, render_template_string
from werkzeug.utils import secure_filename

from clipper_engine import (
    init_song_only_project,
    analyze_song,
    sync_single_clip,
    build_segments_by_mode,
    recut_segments_preserving_timing,
    pick_best_clip_for_window,
    extract_audio_to_wav,
    extract_frame_at_timestamp,
    generate_ai_transition_between_frames,
    render_triller_video,
    ensure_ffmpeg,
    EditSegment,
    ClipAnalysis,
    LyricWord,
    LyricPhrase,
    CLIP_PALETTE,
)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env.local")
load_dotenv(BASE_DIR / ".env")
SONG_DIR = BASE_DIR / "input" / "song"
CLIPS_DIR = BASE_DIR / "input" / "clips"
OUT_DIR = BASE_DIR / "output"
PROXY_DIR = OUT_DIR / "proxies"
STATE_FILE = OUT_DIR / "current_project.json"

for d in (SONG_DIR, CLIPS_DIR, OUT_DIR, PROXY_DIR):
    d.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)

STATE_LOCK = threading.Lock()
CURRENT_PROJECT: dict | None = None
PROJECT_VERSION: int = 1

# Cached master song features so Clip Sync Agents start immediately without re-analyzing the song
CACHED_SONG_PATH: str | None = None
CACHED_SONG_INFO: Dict[str, Any] | None = None
CACHED_MASTER_WAV: str | None = None

# Background Agent Pool & Live Agent Telemetry Registry
AGENT_POOL = concurrent.futures.ThreadPoolExecutor(max_workers=6)
AGENTS_LOCK = threading.Lock()
ACTIVE_AGENTS: Dict[str, Dict[str, Any]] = {}


def update_agent_status(
    agent_id: str,
    name: str,
    role: str,
    stage: str,
    pct: int,
    state: str = "running",  # "running", "done", "error"
    extra: Dict[str, Any] | None = None,
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


def get_cached_song_bundle(song_path: str, proj: dict | None = None) -> tuple[Dict[str, Any], str]:
    """Return cached master song acoustic + lyric features and a persistent 22050Hz WAV path."""
    global CACHED_SONG_PATH, CACHED_SONG_INFO, CACHED_MASTER_WAV
    if (
        CACHED_SONG_PATH == song_path
        and CACHED_SONG_INFO is not None
        and CACHED_MASTER_WAV is not None
        and os.path.exists(CACHED_MASTER_WAV)
    ):
        return CACHED_SONG_INFO, CACHED_MASTER_WAV

    info = analyze_song(song_path, transcribe_lyrics=False)
    if proj and proj.get("lyrics_words"):
        info["lyrics_words"] = [LyricWord(**w) for w in proj.get("lyrics_words", [])]
        info["lyrics_phrases"] = [LyricPhrase(**p) for p in proj.get("lyrics_phrases", [])]
    else:
        full_info = analyze_song(song_path, transcribe_lyrics=True)
        info["lyrics_words"] = full_info["lyrics_words"]
        info["lyrics_phrases"] = full_info["lyrics_phrases"]

    master_wav = str(OUT_DIR / "cached_master_22k.wav")
    extract_audio_to_wav(song_path, master_wav, sr=info["sr"])

    CACHED_SONG_PATH = song_path
    CACHED_SONG_INFO = info
    CACHED_MASTER_WAV = master_wav
    return info, master_wav


def save_project_state(state_dict: dict) -> None:
    global CURRENT_PROJECT, PROJECT_VERSION
    with STATE_LOCK:
        CURRENT_PROJECT = state_dict
        PROJECT_VERSION += 1
        state_dict["version"] = PROJECT_VERSION
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state_dict, f, indent=2)


def load_project_state() -> dict | None:
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
                return None
        return None


def dict_to_clip(c: dict) -> ClipAnalysis:
    valid_keys = {f.name for f in dataclasses.fields(ClipAnalysis)}
    filtered = {k: v for k, v in c.items() if k in valid_keys}
    return ClipAnalysis(**filtered)


def dict_to_segment(s: dict) -> EditSegment:
    valid_keys = {f.name for f in dataclasses.fields(EditSegment)}
    filtered = {k: v for k, v in s.items() if k in valid_keys}
    if "cut_reason" not in filtered:
        filtered["cut_reason"] = "lyrics_808"
    return EditSegment(**filtered)


def spawn_clip_sync_agent(
    cpath: str,
    cname: str,
    song_path: str,
    cut_mode: str,
    agent_idx: int,
) -> str:
    """
    Spin off an autonomous background Clip Sync Agent for `cpath`.
    As soon as it finishes, it merges the synced clip into the live project state
    and updates the timeline cuts so the UI updates progressively!
    """
    agent_id = f"sync_{int(time.time() * 1000)}_{agent_idx}"
    update_agent_status(
        agent_id=agent_id,
        name=f"Clip Agent #{agent_idx}: {cname}",
        role="Hardware Proxy + Audalign + Whisper Lyric Sync",
        stage="🚀 Queued in Parallel Agent Pool...",
        pct=5,
        state="running",
    )

    def _worker():
        try:
            proj = load_project_state()
            song_info, master_wav_norm = get_cached_song_bundle(song_path, proj)

            def _cb(stage_msg: str, pct_val: int):
                update_agent_status(
                    agent_id=agent_id,
                    name=f"Clip Agent #{agent_idx}: {cname}",
                    role="Hardware Proxy + Audalign + Whisper Lyric Sync",
                    stage=stage_msg,
                    pct=pct_val,
                    state="running",
                )

            with tempfile.TemporaryDirectory(prefix=f"agent_{agent_idx}_") as tmpdir:
                raw_id = f"clip_{int(time.time() * 1000)}_{agent_idx}"
                new_clip = sync_single_clip(
                    cpath=cpath,
                    clip_id=raw_id,
                    color=CLIP_PALETTE[agent_idx % len(CLIP_PALETTE)],
                    song_info=song_info,
                    master_wav_norm=master_wav_norm,
                    proxy_dir=PROXY_DIR,
                    tmpdir=tmpdir,
                    progress_cb=_cb,
                )

            # Merge clip into project state thread-safely and re-build cuts!
            cur_proj = load_project_state()
            if cur_proj:
                existing_clips = [
                    dict_to_clip(c)
                    for c in cur_proj.get("clips", [])
                    if c.get("filename") != cname
                ]
                existing_clips.append(new_clip)
                existing_clips.sort(
                    key=lambda c: (0 if c.is_synced_take else 1, c.active_song_start, c.filename)
                )
                for i, c in enumerate(existing_clips):
                    c.color = CLIP_PALETTE[i % len(CLIP_PALETTE)]

                mode_to_use = cur_proj.get("cut_mode") or cut_mode or "lyrics_808"
                segments, r_start, r_end = build_segments_by_mode(
                    song_info,
                    existing_clips,
                    cut_mode=mode_to_use,
                    lyrics_phrases=song_info["lyrics_phrases"],
                )
                cur_proj["clips"] = [dataclasses.asdict(c) for c in existing_clips]
                cur_proj["segments"] = [dataclasses.asdict(s) for s in segments]
                cur_proj["render_start_sec"] = r_start
                cur_proj["render_end_sec"] = r_end
                save_project_state(cur_proj)

            done_label = (
                f"✅ Synced @ {new_clip.active_song_start:.1f}s–{new_clip.active_song_end:.1f}s ({new_clip.sync_method})"
                if new_clip.is_synced_take
                else "⚠️ Ignored (No Song Detected)"
            )
            update_agent_status(
                agent_id=agent_id,
                name=f"Clip Agent #{agent_idx}: {cname}",
                role="Hardware Proxy + Audalign + Whisper Lyric Sync",
                stage=done_label,
                pct=100,
                state="done",
            )
        except Exception as e:
            update_agent_status(
                agent_id=agent_id,
                name=f"Clip Agent #{agent_idx}: {cname}",
                role="Hardware Proxy + Audalign + Whisper Lyric Sync",
                stage=f"❌ Error: {e}",
                pct=100,
                state="error",
            )

    AGENT_POOL.submit(_worker)
    return agent_id


HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
  <title>CLIPPER — Parallel Multi-Agent Sync Studio</title>
  <script src="https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js"></script>
  <script src="https://unpkg.com/wavesurfer.js@7/dist/plugins/regions.min.js"></script>
  <style>
    :root {
      --bg: #09090d;
      --panel: #12121a;
      --panel2: #181824;
      --border: #27273a;
      --accent: #ff2a85;
      --accent2: #7c3aed;
      --cyan: #06b6d4;
      --green: #10b981;
      --amber: #f59e0b;
      --red: #ef4444;
      --text: #f3f4f6;
      --muted: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      max-width: 100vw;
      min-height: 100vh;
      overflow-x: hidden;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      flex-direction: column;
    }
    header {
      min-height: 52px;
      height: auto;
      padding: 8px 14px;
      background: rgba(18, 18, 26, 0.96);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      flex-shrink: 0;
      gap: 8px;
      width: 100%;
      min-width: 0;
      position: sticky;
      top: 0;
      z-index: 80;
    }
    .brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
    .brand h1 { font-size: 15px; font-weight: 800; letter-spacing: 0.02em; white-space: nowrap; }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      min-width: 0;
      justify-content: flex-end;
    }
    .btn {
      padding: 6px 10px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--panel2); color: var(--text); font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.14s; display: inline-flex; align-items: center; gap: 5px;
      white-space: nowrap; text-decoration: none;
    }
    .btn:hover { border-color: #4b5563; background: #222233; }
    .btn-step1 { border-color: rgba(6, 182, 212, 0.5); }
    .btn-step2 { border-color: rgba(16, 185, 129, 0.5); }
    .btn-agents { border-color: var(--accent2); }
    .btn-danger { border-color: rgba(239, 68, 68, 0.45); color: #fca5a5; }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.2); border-color: var(--red); }
    .btn-primary {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border: none; color: #fff;
      box-shadow: 0 2px 10px rgba(255, 42, 133, 0.35);
    }
    .btn-download {
      background: rgba(16, 185, 129, 0.18);
      border: 1px solid var(--green);
      color: #6ee7b7;
    }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    select.btn { padding-right: 6px; max-width: 190px; overflow: hidden; text-overflow: ellipsis; }

    /* Live Parallel Agents Floating Drawer */
    .agents-drawer {
      position: fixed;
      top: 56px;
      right: 14px;
      width: 360px;
      max-width: calc(100vw - 28px);
      max-height: 380px;
      background: rgba(18, 18, 26, 0.96);
      backdrop-filter: blur(10px);
      border: 1px solid var(--accent2);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.65);
      z-index: 90;
      display: none;
      flex-direction: column;
      overflow: hidden;
    }
    .agents-drawer-header {
      padding: 9px 12px;
      background: #181826;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 700;
    }
    .agents-list {
      padding: 10px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .agent-card {
      background: #0d0d15;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 11px;
    }
    .agent-card.running { border-color: var(--cyan); }
    .agent-card.done { border-color: rgba(16, 185, 129, 0.45); }
    .agent-card.error { border-color: var(--red); }
    .agent-bar-bg {
      height: 5px;
      background: #1f1f2e;
      border-radius: 99px;
      overflow: hidden;
      margin-top: 6px;
    }
    .agent-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyan), var(--accent));
      transition: width 0.25s ease;
    }

    /* Main Responsive 2-Column Split Workspace */
    .workspace {
      flex: 1;
      width: 100%;
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(0, 56%) minmax(0, 44%);
      border-bottom: 1px solid var(--border);
      align-items: stretch;
    }

    /* Left Column: Big 16:9 Master Video Player */
    .monitor-pane {
      background: #0b0b11;
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding: 10px 14px;
      gap: 8px;
    }
    .monitor-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      flex-wrap: wrap;
    }
    .cut-pill-header {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #161625;
      border: 1px solid var(--cyan);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
      color: #fff;
      white-space: nowrap;
    }
    .monitor-stage-wrap {
      width: 100%;
      aspect-ratio: 16 / 9;
      max-height: 38vh;
      min-height: 180px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      border-radius: 10px;
      border: 1px solid var(--border);
      position: relative;
      overflow: hidden;
    }
    .monitor-screen {
      width: 100%;
      height: 100%;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .monitor-screen video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .monitor-hud {
      position: absolute;
      top: 8px;
      left: 8px;
      right: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      pointer-events: none;
      gap: 6px;
    }
    .hud-chip {
      padding: 3px 9px;
      background: rgba(9, 9, 15, 0.82);
      backdrop-filter: blur(4px);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      color: #fff;
    }
    .monitor-lyric-overlay {
      position: absolute;
      bottom: 8px;
      left: 12px;
      right: 12px;
      padding: 5px 10px;
      background: rgba(9, 9, 15, 0.84);
      border-radius: 7px;
      font-size: 12px;
      font-weight: 700;
      text-align: center;
      color: #fff;
      pointer-events: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .transport-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      flex-wrap: wrap;
    }

    /* Right Column: Simple Camera Angle Switcher */
    .take-picker-pane {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: var(--bg);
    }
    .pane-toolbar {
      padding: 10px 14px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }
    .range-pill {
      display: inline-flex; align-items: center; gap: 5px;
      background: #0d0d14; border: 1px solid var(--border);
      padding: 3px 8px; border-radius: 7px; font-size: 11px;
    }
    .range-pill input[type="number"] {
      width: 54px; background: var(--panel2); border: 1px solid var(--border);
      color: #fff; padding: 2px 4px; border-radius: 4px; font-size: 11px; font-weight: 600;
    }
    .takes-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .takes-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      align-items: start;
    }
    .take-card {
      background: var(--panel);
      border: 2px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      cursor: pointer;
      flex-shrink: 0;
      transition: border-color 0.12s ease, transform 0.12s ease;
    }
    .take-card:hover {
      border-color: var(--cyan);
      transform: translateY(-1px);
    }
    .take-card.active-take {
      border-color: var(--green);
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.35);
      background: #121c19;
    }
    .take-video-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      min-height: 110px;
      background: #000;
      flex-shrink: 0;
    }
    .take-video-wrap video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .take-key-badge {
      position: absolute;
      top: 6px;
      left: 6px;
      padding: 3px 7px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 800;
      background: rgba(6, 182, 212, 0.94);
      color: #000;
    }
    .take-card.active-take .take-key-badge {
      background: var(--green);
      color: #031911;
    }
    .take-energy-badge {
      position: absolute;
      top: 6px;
      right: 6px;
      padding: 2px 6px;
      border-radius: 5px;
      font-size: 10px;
      font-weight: 800;
      background: rgba(9, 9, 15, 0.85);
      color: var(--amber);
    }
    .take-body {
      padding: 7px 9px;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .take-title {
      font-weight: 700;
      font-size: 11px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .lyric-snippet {
      font-size: 10px;
      color: var(--cyan);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .color-dot {
      width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0;
    }
    details.broll-drawer {
      background: #101018;
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 8px 10px;
    }
    details.broll-drawer summary {
      cursor: pointer;
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      user-select: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    details.broll-drawer[open] summary {
      margin-bottom: 10px;
      color: var(--text);
    }

    /* Ultra-Simple Multi-Track Bottom Timeline */
    .timeline-dock {
      min-height: 158px;
      max-height: 360px;
      width: 100%;
      max-width: 100vw;
      background: var(--panel);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      user-select: none;
      transition: max-height 0.2s ease;
    }
    .timeline-dock.expanded-tracks {
      max-height: 440px;
    }
    .timeline-toolbar {
      min-height: 32px;
      padding: 4px 14px;
      background: #0e0e16;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 11px;
      flex-shrink: 0;
      gap: 8px;
      flex-wrap: wrap;
    }
    .timeline-scroll {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      position: relative;
      padding: 6px 14px 10px;
    }
    .timeline-zoom-inner {
      min-width: 100%;
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .track-row {
      display: grid;
      grid-template-columns: 110px 1fr;
      align-items: center;
      min-height: 32px;
    }
    .track-label {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      padding-right: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .track-lane {
      position: relative;
      height: 32px;
      background: #0c0c13;
      border-radius: 6px;
      border: 1px solid #1e1e2e;
      overflow: hidden;
    }
    .ruler-lane {
      position: relative;
      height: 22px;
      background: #090910;
      border-radius: 5px;
      border: 1px solid #1a1a28;
      overflow: hidden;
      cursor: pointer;
    }
    .ruler-tick {
      position: absolute;
      top: 2px;
      font-size: 9.5px;
      font-family: monospace;
      color: #64748b;
      transform: translateX(3px);
      pointer-events: none;
      border-left: 1px solid rgba(148, 163, 184, 0.25);
      padding-left: 3px;
      height: 18px;
    }
    .bass-hit-pin {
      position: absolute;
      bottom: 0;
      width: 3px;
      height: 9px;
      background: var(--amber);
      border-radius: 2px 2px 0 0;
      opacity: 0.85;
      pointer-events: none;
    }
    .lyrics-lane {
      position: relative;
      height: 26px;
      background: #0b0b14;
      border-radius: 5px;
      border: 1px solid #1c1c2b;
      overflow: hidden;
    }
    .lyric-chip {
      position: absolute;
      top: 3px;
      bottom: 3px;
      background: rgba(6, 182, 212, 0.14);
      border: 1px solid rgba(6, 182, 212, 0.42);
      color: #a5f3fc;
      font-size: 9.5px;
      font-weight: 600;
      padding: 0 5px;
      border-radius: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    .lyric-chip:hover {
      background: rgba(6, 182, 212, 0.28);
      border-color: var(--cyan);
      color: #fff;
    }
    .clip-bar {
      position: absolute;
      top: 4px;
      bottom: 4px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
      color: #fff;
      padding: 0 6px;
      display: flex;
      align-items: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      opacity: 0.88;
    }
    .clip-bar:hover { opacity: 1; outline: 1px solid #fff; }
    .range-highlight {
      position: absolute;
      top: 0;
      bottom: 0;
      background: rgba(6, 182, 212, 0.22);
      border-left: 2px solid var(--cyan);
      border-right: 2px solid var(--cyan);
      pointer-events: none;
      z-index: 25;
    }
    .playhead-line {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: #ff2a85;
      box-shadow: 0 0 8px rgba(255, 42, 133, 0.9);
      pointer-events: none;
      z-index: 30;
    }
    .playhead-line::before {
      content: '';
      position: absolute;
      top: 0;
      left: -4px;
      width: 10px;
      height: 8px;
      background: #ff2a85;
      clip-path: polygon(0 0, 100% 0, 50% 100%);
    }
    /* Master Monitor Interactive Scrubber Bar (Runway / DaVinci Cut Style) */
    .master-scrub-wrap {
      position: relative;
      height: 18px;
      background: #12121e;
      border: 1px solid var(--border);
      border-radius: 999px;
      cursor: pointer;
      overflow: hidden;
      display: flex;
      align-items: center;
      user-select: none;
    }
    .master-scrub-fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 0%;
      background: linear-gradient(90deg, rgba(6, 182, 212, 0.38), rgba(255, 42, 133, 0.55));
      pointer-events: none;
    }
    .master-scrub-thumb {
      position: absolute;
      top: 1px;
      bottom: 1px;
      width: 4px;
      background: #fff;
      border-radius: 2px;
      box-shadow: 0 0 8px #ff2a85;
      transform: translateX(-2px);
      pointer-events: none;
      z-index: 5;
    }
    .master-scrub-ai-pin {
      position: absolute;
      top: 2px;
      bottom: 2px;
      width: 4px;
      border-radius: 2px;
      background: #e879f9;
      box-shadow: 0 0 6px rgba(232, 121, 249, 0.9);
      pointer-events: none;
      z-index: 3;
    }
    .take-energy-meter {
      height: 3px;
      width: 100%;
      background: #1a1a28;
      border-radius: 99px;
      overflow: hidden;
      margin-top: 3px;
    }
    .take-energy-meter-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--cyan), var(--amber));
      border-radius: 99px;
    }
    .filter-pill-group {
      display: inline-flex;
      background: #0d0d15;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2px;
      gap: 2px;
    }
    .filter-pill {
      background: transparent;
      border: none;
      color: var(--muted);
      font-size: 10.5px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      cursor: pointer;
    }
    .filter-pill.active {
      background: var(--panel2);
      color: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    }
    .assembled-seg {
      position: absolute;
      top: 2px;
      bottom: 2px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      padding: 0 5px;
      cursor: pointer;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.55);
    }
    .assembled-seg.selected {
      outline: 2px solid #fff;
      z-index: 15;
    }

    /* Second & Clip Navigator Timeline (Directly under AI Morph Transitions Bar) */
    .clip-timeline-nav-wrap {
      background: #10101a;
      border: 1px solid rgba(6, 182, 212, 0.42);
      border-radius: 9px;
      padding: 7px 10px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex-shrink: 0;
    }
    .second-pills-strip {
      display: flex;
      align-items: center;
      gap: 4px;
      overflow-x: auto;
      padding-bottom: 3px;
      scrollbar-width: thin;
    }
    .sec-nav-pill {
      padding: 2px 6px;
      font-size: 10px;
      font-family: monospace;
      font-weight: 700;
      border-radius: 5px;
      background: #171726;
      border: 1px solid #28283e;
      color: var(--muted);
      cursor: pointer;
      flex-shrink: 0;
      user-select: none;
      transition: all 0.12s ease;
    }
    .sec-nav-pill.major-sec {
      border-color: rgba(6, 182, 212, 0.45);
      color: #cbd5e1;
      background: #1a1d2e;
    }
    .sec-nav-pill:hover {
      border-color: var(--cyan);
      color: #fff;
      background: rgba(6, 182, 212, 0.22);
    }
    .sec-nav-pill.active-sec {
      background: var(--cyan);
      border-color: #fff;
      color: #03151a;
      box-shadow: 0 0 8px rgba(6, 182, 212, 0.65);
    }
    .triller-segment-strip {
      display: flex;
      align-items: stretch;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: thin;
    }
    .triller-cut-pill {
      min-width: 138px;
      max-width: 175px;
      background: #161624;
      border: 1px solid #2b2b42;
      border-radius: 7px;
      padding: 5px 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      cursor: pointer;
      flex-shrink: 0;
      user-select: none;
      transition: all 0.12s ease;
    }
    .triller-cut-pill:hover {
      border-color: var(--cyan);
      background: #1c1e30;
      transform: translateY(-1px);
    }
    .triller-cut-pill.active-cut {
      background: linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(255, 42, 133, 0.22));
      border: 1.5px solid var(--cyan);
      box-shadow: 0 0 12px rgba(6, 182, 212, 0.45);
    }
    .triller-cut-pill.ai-cut {
      border-color: rgba(168, 85, 247, 0.6);
      background: rgba(147, 51, 234, 0.16);
    }
    .triller-cut-pill.ai-cut.active-cut {
      background: linear-gradient(135deg, rgba(147, 51, 234, 0.42), rgba(219, 39, 119, 0.38));
      border-color: #f472b6;
      box-shadow: 0 0 12px rgba(219, 39, 119, 0.55);
    }
    .triller-cut-pill .seg-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      font-size: 10.5px;
      font-weight: 800;
      color: #fff;
    }
    .triller-cut-pill .angles-badge {
      font-size: 9.5px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(6, 182, 212, 0.18);
      color: #67e8f9;
      border: 1px solid rgba(6, 182, 212, 0.35);
    }
    .triller-cut-pill .seg-clip {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: #cbd5e1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .take-replace-cta {
      margin-top: 4px;
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 10.5px;
      font-weight: 800;
      text-align: center;
      background: rgba(6, 182, 212, 0.16);
      border: 1px solid rgba(6, 182, 212, 0.45);
      color: #67e8f9;
      transition: all 0.12s ease;
    }
    .take-card:hover .take-replace-cta {
      background: var(--cyan);
      border-color: #fff;
      color: #021318;
    }
    .take-card.active-take .take-replace-cta {
      background: rgba(16, 185, 129, 0.22);
      border-color: var(--green);
      color: #6ee7b7;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.76);
      backdrop-filter: blur(4px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
    }
    .modal-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      width: 560px;
      max-width: 92vw;
      padding: 22px;
      max-height: 86vh;
      overflow-y: auto;
    }
    .modal-card h3 { font-size: 16px; margin-bottom: 10px; }
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 5px; }
    .form-group input[type="file"] {
      width: 100%; padding: 9px 11px; background: #0c0c13; border: 1px solid var(--border);
      border-radius: 8px; color: var(--text); font-size: 12px;
    }
    .clip-manage-item {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 10px; background: #0c0c14; border: 1px solid var(--border);
      border-radius: 8px; margin-bottom: 7px; font-size: 12px;
      flex-wrap: wrap; gap: 8px;
    }

    /* Responsive Tablet & Mobile Breakpoints */
    @media (max-width: 1024px) {
      .workspace {
        grid-template-columns: 1fr;
      }
      .monitor-pane {
        border-right: none;
        border-bottom: 1px solid var(--border);
      }
      .monitor-stage-wrap {
        max-height: 44vh;
      }
      .take-picker-pane {
        max-height: 460px;
      }
      .takes-grid {
        grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
      }
    }
    @media (max-width: 640px) {
      header {
        padding: 8px 10px;
        gap: 6px;
      }
      .brand h1 { font-size: 14px; }
      .header-actions {
        width: 100%;
        justify-content: flex-start;
        overflow-x: auto;
        padding-bottom: 2px;
      }
      .btn {
        padding: 5px 8px;
        font-size: 11px;
      }
      select.btn {
        max-width: 145px;
      }
      .monitor-pane {
        padding: 8px 10px;
      }
      .takes-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .track-row {
        grid-template-columns: 78px 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <h1>🎬 CLIPPER</h1>
      <span id="projectMeta" style="font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:42vw;">Upload Song to Begin</span>
    </div>
    <div class="header-actions">
      <button class="btn btn-step1" onclick="openSongModal()">🎵 Song</button>
      <button class="btn btn-step2" onclick="openAddClipsModal()">➕ Videos</button>

      <select id="cutModeSelect" class="btn" onchange="resliceWithMode(this.value, false)" title="Cut Pacing Mode">
        <option value="lyrics_808" selected>Pace: Lyrics + 808s</option>
        <option value="lyrics_only">Pace: Lyrics Only</option>
        <option value="beat_808">Pace: 808 Hits Only</option>
        <option value="2s">Pace: ~2s Cuts</option>
        <option value="4s">Pace: ~4s Cuts</option>
      </select>

      <button class="btn" onclick="resliceWithMode(document.getElementById('cutModeSelect').value, true)" id="resliceBtn" disabled title="Randomize camera angles while prioritizing high energy">
        🎲 Re-Cut
      </button>

      <select id="colorGradeSelect" class="btn" onchange="onMasterLookChange()" title="Master Cinema Color Grade & Multi-Cam Auto Match">
        <option value="none" selected>🎨 Grade: Off (Original)</option>
        <option value="kodak_2383">🎞️ Grade: Kodak 2383 + Cam Match</option>
        <option value="night_trap">🌙 Grade: Night Trap (Teal &amp; Amber)</option>
        <option value="bleach_bypass">🖤 Grade: Bleach Bypass (Gritty)</option>
        <option value="warm_vintage">☀️ Grade: Warm 16mm Gold</option>
      </select>

      <select id="qualityModeSelect" class="btn" onchange="onMasterLookChange()" title="AMD FidelityFX CAS Sharpening + 3D Temporal Low-Light Denoise">
        <option value="cas_crisp" selected>⚡ FidelityFX CAS + 3D Denoise</option>
        <option value="ultra_cinema">💎 Ultra Detail + Denoise</option>
        <option value="none">⚡ Enhance: Off</option>
      </select>

      <button class="btn btn-agents" onclick="toggleAgentsDrawer()" id="agentsToggleBtn" title="Background Sync Agents">
        🤖 <span id="runningAgentsCount">0</span>
      </button>

      <details style="position:relative;">
        <summary class="btn" style="list-style:none;" title="Keyboard Shortcuts Cheat-Sheet">⌨️ Keys</summary>
        <div style="position:absolute;right:0;top:36px;z-index:95;background:#141422;border:1px solid var(--border);border-radius:10px;padding:10px 12px;width:250px;box-shadow:0 12px 30px rgba(0,0,0,0.7);font-size:11px;display:flex;flex-direction:column;gap:5px;">
          <div style="font-weight:800;color:var(--cyan);margin-bottom:2px;">⌨️ NLE Keyboard Shortcuts</div>
          <div style="display:flex;justify-content:space-between;"><span>Play / Pause Master</span><code>Space</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Prev / Next Cut</span><code>← / →</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Hot-Swap Angle 1–9</span><code>1 – 9</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Loop Active Cut</span><code>L</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Split Cut at Playhead</span><code>S</code></div>
          <div style="display:flex;justify-content:space-between;"><span>Set In / Out Point</span><code>I / O</code></div>
        </div>
      </details>

      <button class="btn btn-primary" onclick="exportFinalVideo()" id="exportBtn" disabled>🎬 Export MP4</button>
      <a class="btn btn-download" id="headerDownloadMp4Link" href="/output/triller_horizontal_1793849733.mp4" download style="display:inline-flex;">⬇️ Download MP4</a>
    </div>
  </header>

  <!-- Live Parallel Worker Agents Drawer -->
  <div class="agents-drawer" id="agentsDrawer">
    <div class="agents-drawer-header">
      <span>🤖 Parallel Sync &amp; Render Agents</span>
      <button class="btn" style="padding:2px 7px;font-size:11px;" onclick="toggleAgentsDrawer()">✕</button>
    </div>
    <div class="agents-list" id="agentsList">
      <div style="color:var(--muted);font-size:11px;text-align:center;padding:12px;">
        Idle — Upload clips or export video to spin up parallel worker agents.
      </div>
    </div>
  </div>

  <div class="workspace">
    <!-- Left Column: Big 16:9 Master Video Player -->
    <div class="monitor-pane">
      <div class="monitor-topbar">
        <div style="display:flex;align-items:center;gap:8px;min-width:0;">
          <span class="cut-pill-header" id="activeCutIndexLabel">🎯 Cut #1</span>
          <span id="segReasonBadge" style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>
        </div>
        <span id="timecodeDisplay" style="font-family:monospace;font-size:12px;font-weight:700;color:var(--cyan);">00.00s / 00.00s</span>
      </div>

      <div class="monitor-stage-wrap">
        <div class="monitor-screen" id="monitorScreen">
          <video id="programVideo" playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;background:transparent;"></video>
          <video id="programVideoBuffer" playsinline muted preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:1;opacity:0;pointer-events:none;background:transparent;"></video>
          <div class="monitor-hud" style="z-index:10;">
            <span class="hud-chip" id="activeClipHud">Clip: —</span>
            <span class="hud-chip" id="activeAiHud" style="display:none;background:linear-gradient(135deg,#9333ea,#db2777);border-color:#f472b6;color:#fff;box-shadow:0 0 14px rgba(219,39,119,0.7);">✨ AI MORPH ACTIVE</span>
            <span class="hud-chip" id="activeSyncHud" style="color:var(--green);">🔒 Seamless Master</span>
          </div>
        </div>
      </div>

      <!-- Interactive Runway/DaVinci-Style Master Scrubber with AI Transition Pins -->
      <div class="master-scrub-wrap" id="masterScrubWrap" title="Click or drag to scrub master timeline (Purple pins = ✨ AI Morph Transitions)">
        <div class="master-scrub-fill" id="masterScrubFill"></div>
        <div id="masterScrubPins" style="position:absolute;inset:0;pointer-events:none;"></div>
        <div class="master-scrub-thumb" id="masterScrubThumb"></div>
      </div>

      <!-- Dedicated AI Transitions Bar so user can see and jump to every AI effect -->
      <div id="aiTransitionsBarWrap" style="background:#11111b;border:1px solid rgba(168,85,247,0.45);border-radius:9px;padding:7px 10px;display:flex;flex-direction:column;gap:5px;flex-shrink:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:11px;font-weight:800;color:#e9d5ff;display:flex;align-items:center;gap:6px;">
            ✨ AI Morph Transitions in Timeline (<span id="aiTransCountBadge">0</span>)
            <span style="font-weight:500;color:var(--muted);font-size:10px;">— Click any badge to preview &amp; play through the transition</span>
          </span>
          <span id="seamlessModeBadge" style="font-size:10px;color:var(--green);font-weight:700;">⚡ Zero-Flash Master Playback</span>
        </div>
        <div id="aiTransitionsPills" style="display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;"></div>
      </div>

      <!-- Second & Clip Navigator Timeline directly under the AI Animation Timeline -->
      <div class="clip-timeline-nav-wrap" id="clipTimelineNavigatorWrap">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:800;color:var(--cyan);display:flex;align-items:center;gap:6px;">
            🎬 Second &amp; Clip Timeline (<span id="clipNavTotalCount">0</span> Clips)
            <span style="font-weight:500;color:var(--muted);font-size:10px;">— Click any second or clip card to preview available clips &amp; replace</span>
          </span>
          <div style="display:flex;align-items:center;gap:4px;">
            <button type="button" class="btn" style="padding:2px 6px;font-size:10px;" onclick="stepSecond(-1)" title="Jump back 1 second">-1s</button>
            <div style="display:inline-flex;align-items:center;gap:2px;background:#0b0b13;border:1px solid var(--border);border-radius:6px;padding:1px 6px;font-size:10.5px;">
              <span style="color:var(--muted);">⏱️</span>
              <input type="number" id="quickSecJumpInput" min="0" step="1" value="0" onchange="jumpToSecond(parseFloat(this.value)||0)" style="width:42px;background:transparent;border:none;color:var(--cyan);font-family:monospace;font-weight:800;font-size:11px;text-align:right;outline:none;" title="Type any second to jump directly to that timestamp" />
              <span style="color:var(--muted);font-family:monospace;">s</span>
            </div>
            <button type="button" class="btn" style="padding:2px 6px;font-size:10px;" onclick="stepSecond(1)" title="Jump forward 1 second">+1s</button>
          </div>
        </div>
        <div class="second-pills-strip" id="secondPillsStrip" title="Click any second to jump to that timestamp and select its clip"></div>
        <div class="triller-segment-strip" id="trillerSegmentStrip" title="Click any clip to see all available clips for that section on the right and replace it in 1 click"></div>
      </div>

      <div class="transport-bar">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button class="btn" onclick="stepCutSelection(-1)" title="Previous Cut (Left Arrow)">⬅️ Prev</button>
          <button class="btn btn-primary" id="playPauseBtn" onclick="togglePlay()" style="min-width:120px;justify-content:center;">
            ▶️ Play (Space)
          </button>
          <button class="btn" id="loopCutBtn" onclick="loopSelectedRange()" title="Loop just this cut with song audio (Key: L)">
            🔁 Loop Cut
          </button>
          <button class="btn" onclick="stepCutSelection(1)" title="Next Cut (Right Arrow)">Next ➡️</button>
        </div>

        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <button class="btn" onclick="splitSegmentAtPlayhead()" title="Split current cut at playhead (Key: S)">✂️ Split</button>
          <button class="btn" style="border-color:rgba(168,85,247,0.65);background:rgba(124,58,237,0.20);color:#e9d5ff;" onclick="openAiTransitionModal()">
            ✨ AI Transition
          </button>
          <button class="btn btn-primary" onclick="exportFinalVideo()" id="transportExportBtn">🎬 Export MP4</button>
          <a class="btn btn-download" id="transportDownloadMp4Link" href="/output/triller_horizontal_1793849733.mp4" download>⬇️ Download MP4</a>
        </div>
      </div>
    </div>

    <!-- Right Column: Camera Angles for Current Cut -->
    <div class="take-picker-pane">
      <div class="pane-toolbar" style="flex-wrap:wrap;">
        <div style="min-width:0;flex:1;">
          <div style="font-size:13px;font-weight:800;color:#fff;" id="syncBinTitle">🎥 Choose Camera Angle</div>
          <div style="font-size:11px;color:var(--muted);" id="syncBinSubtitle">
            Click a clip (or press <code>1–9</code>) to switch it into the video
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
          <div class="filter-pill-group" title="Filter Multicam Angles">
            <button type="button" class="filter-pill active" id="angleFilterAll" onclick="setAngleFilter('all')">All</button>
            <button type="button" class="filter-pill" id="angleFilterSynced" onclick="setAngleFilter('synced')">🔒 Synced</button>
            <button type="button" class="filter-pill" id="angleFilterEnergy" onclick="setAngleFilter('energy')">⚡ Peak</button>
          </div>

          <details style="position:relative;flex-shrink:0;">
            <summary class="btn" style="font-size:11px;padding:4px 8px;list-style:none;">⚙️ Timing</summary>
            <div style="position:absolute;right:0;top:32px;z-index:60;background:#151523;border:1px solid var(--border);border-radius:10px;padding:10px;width:270px;box-shadow:0 10px 28px rgba(0,0,0,0.65);display:flex;flex-direction:column;gap:8px;">
              <div class="range-pill" style="justify-content:space-between;">
                <span>In</span>
                <input type="number" step="0.05" id="selStartInput" value="0.00" onchange="onManualRangeChange()" />
                <span>Out</span>
                <input type="number" step="0.05" id="selEndInput" value="2.00" onchange="onManualRangeChange()" />
                <span id="selDurLabel" style="color:var(--cyan);font-weight:700;">(2.0s)</span>
              </div>
              <select id="segEffectSelect" class="btn" onchange="updateSelectedSegmentEffect(this.value)" style="display:none;">
                <option value="none" selected>None</option>
              </select>
            </div>
          </details>
        </div>
      </div>

      <div class="takes-scroll" id="takesScrollContainer">
        <div class="takes-grid" id="takesGrid"></div>
        <div id="brollContainer"></div>
      </div>
    </div>
  </div>

  <!-- Multi-Track Bottom Timeline with Ruler + 808 Pins + Lyrics + Multicam Drawer -->
  <div class="timeline-dock" id="timelineDock">
    <div class="timeline-toolbar">
      <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;">
        <strong>🎞️ Timeline</strong>
        <button class="btn btn-primary" style="padding:1px 6px;font-size:10px;" onclick="setTimelineZoom(1)" id="zoomBtn1">1x</button>
        <button class="btn" style="padding:1px 6px;font-size:10px;" onclick="setTimelineZoom(2)" id="zoomBtn2">2x</button>
        <button class="btn" style="padding:1px 6px;font-size:10px;" onclick="setTimelineZoom(4)" id="zoomBtn4">4x</button>
        <button class="btn" style="padding:1px 6px;font-size:10px;" onclick="setTimelineZoom(8)" id="zoomBtn8">8x</button>
        <button class="btn" style="padding:1px 7px;font-size:10px;border-color:rgba(6,182,212,0.5);" onclick="toggleLyricsLane()" id="toggleLyricsBtn">🎤 Hide Lyrics</button>
        <button class="btn" style="padding:1px 7px;font-size:10px;" onclick="toggleAllCameraTracks()" id="toggleTracksBtn">📊 Show All Camera Tracks</button>
        <span id="segCountLabel" style="color:var(--muted);font-size:11px;"></span>
        <span id="bassCountLabel" style="color:var(--amber);font-size:10.5px;font-weight:700;"></span>
        <span id="phraseCountLabel" style="color:var(--cyan);font-size:10.5px;"></span>
      </div>
      <div id="statusBanner" style="color:var(--cyan);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Ready</div>
    </div>

    <div class="timeline-scroll" id="timelineScroll">
      <div class="timeline-zoom-inner" id="timelineZoomInner">
        <div class="track-row" style="min-height:22px;">
          <div class="track-label" style="font-size:10px;">⏱️ Ruler / 808s</div>
          <div class="ruler-lane" id="rulerLane"></div>
        </div>
        <div class="track-row" id="lyricsTrackRow" style="min-height:26px;">
          <div class="track-label" style="font-size:10px;color:var(--cyan);">🎤 Lyrics</div>
          <div class="lyrics-lane" id="lyricsLane"></div>
        </div>

        <div class="track-row">
          <div class="track-label">🎵 Song Audio</div>
          <div class="track-lane" id="waveformContainer" style="height:32px;cursor:pointer;"></div>
        </div>

        <div class="track-row">
          <div class="track-label" style="color:#fff;">🎬 Video Cuts</div>
          <div class="track-lane" id="assembledLane" style="height:32px;background:#141422;"></div>
        </div>

        <div id="clipLanesContainer" style="display:none;"></div>
      </div>
    </div>
  </div>

  <!-- Step 1 Modal: Upload Master Song First -->
  <div class="modal-backdrop" id="songModal">
    <div class="modal-card">
      <h3>1️⃣ Step 1: Upload / Change Master Song (.wav / .mp3 / .m4a)</h3>
      <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">
        Transcribes word-level lyrics via <code>faster-whisper</code> and detects <strong>808 sub-bass hits</strong> &amp; BPM.
      </p>
      <form id="songForm">
        <div class="form-group">
          <label>Select Master Song File (or leave empty to reload file in <code>clipper/input/song/</code>)</label>
          <input type="file" name="song" accept=".wav,.mp3,.m4a,.flac" />
        </div>
        <div style="display:flex;justify-content:flex-end;gap:10px;">
          <button type="button" class="btn" onclick="closeSongModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="songSubmitBtn">🎵 Load &amp; Transcribe Master Song</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Step 2 Modal: Upload / Add / Delete Horizontal Video Clips -->
  <div class="modal-backdrop" id="addClipsModal">
    <div class="modal-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3>➕ Upload New Videos (Spawns Parallel Sync Agents) or Delete Clips</h3>
        <button class="btn" onclick="closeAddClipsModal()">✕ Close</button>
      </div>

      <form id="addClipsForm" style="padding-bottom:16px;border-bottom:1px solid var(--border);margin-bottom:14px;">
        <div class="form-group">
          <label>Select Horizontal Video Clips — each clip spins off its own parallel background Sync Agent and streams onto the timeline as soon as it finishes</label>
          <input type="file" name="clips" accept=".mp4,.mov,.m4v,.webm" multiple required />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <button type="button" class="btn" onclick="resyncAllFromFolder()" id="resyncAllBtn">🔄 Re-Spawn Agents for All in input/clips/</button>
          <button type="submit" class="btn btn-primary" id="addClipsSubmitBtn">🚀 Launch Parallel Sync Agents</button>
        </div>
      </form>

      <div>
        <h4 style="font-size:13px;margin-bottom:8px;color:var(--muted);">Uploaded Video Clips in Project (<span id="modalClipCount">0</span>)</h4>
        <div id="manageClipsList"></div>
      </div>
    </div>
  </div>

  <!-- Exported Video Modal -->
  <div class="modal-backdrop" id="exportModal">
    <div class="modal-card" style="width:680px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3>✅ 16:9 Master MP4 Export Complete</h3>
        <button class="btn" onclick="document.getElementById('exportModal').style.display='none'">✕ Close</button>
      </div>
      <video id="exportedVideoPlayer" controls playsinline style="width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;"></video>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span id="exportPathText" style="font-size:11px;color:var(--muted);"></span>
        <a id="downloadExportLink" class="btn btn-primary" download>⬇️ Download 1080p MP4</a>
      </div>
    </div>
  </div>

  <!-- AI Frame-to-Frame Transition Studio Modal -->
  <div class="modal-backdrop" id="aiTransitionModal">
    <div class="modal-card" style="width:720px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3>✨ AI Frame-to-Frame Transition Studio (Last Frame → First Frame)</h3>
        <button class="btn" onclick="closeAiTransitionModal()">✕ Close</button>
      </div>
      <p style="font-size:12px;color:var(--muted);margin-bottom:12px;">
        Extracts the <strong>last frame of Cut A</strong> and the <strong>first frame of Cut B</strong> at the boundary, synthesizes an AI transition clip between them, and inserts it seamlessly onto the timeline without shifting your song lyric sync!
      </p>

      <div id="aiTransBoundaryInfo" style="font-size:12px;font-weight:700;color:var(--cyan);margin-bottom:10px;">
        Loading boundary frames...
      </div>

      <!-- Side-by-side Frame A -> Frame B preview with 1-click download for Higgsfield Web -->
      <div style="display:grid;grid-template-columns:1fr 42px 1fr;gap:8px;align-items:center;margin-bottom:12px;">
        <div style="background:#0c0c14;border:1px solid var(--border);border-radius:8px;padding:6px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;" id="frameALabel">Last Frame of Cut A</div>
          <img id="frameAPreviewImg" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:#000;" />
          <div style="margin-top:6px;">
            <a id="downloadFrameABtn" class="btn" style="font-size:11px;padding:4px 9px;text-decoration:none;" download="Start_Frame_A.png">⬇️ Save Start Frame (A)</a>
          </div>
        </div>
        <div style="text-align:center;font-size:18px;color:#c084fc;font-weight:800;">✨➜</div>
        <div style="background:#0c0c14;border:1px solid var(--border);border-radius:8px;padding:6px;text-align:center;">
          <div style="font-size:11px;color:var(--muted);margin-bottom:4px;" id="frameBLabel">First Frame of Cut B</div>
          <img id="frameBPreviewImg" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:#000;" />
          <div style="margin-top:6px;">
            <a id="downloadFrameBBtn" class="btn" style="font-size:11px;padding:4px 9px;text-decoration:none;" download="End_Frame_B.png">⬇️ Save End Frame (B)</a>
          </div>
        </div>
      </div>

      <!-- Option 1: Regular Higgsfield Web Subscription ($0 Extra API Cost) -->
      <div style="background:rgba(16, 185, 129, 0.08);border:1px solid rgba(16, 185, 129, 0.45);border-radius:10px;padding:10px 12px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
          <strong style="font-size:12px;color:var(--green);">✅ Option 1: Use Your Regular Higgsfield Web Subscription ($0 API Cost)</strong>
          <a href="https://higgsfield.ai" target="_blank" rel="noopener" class="btn" style="font-size:11px;padding:4px 9px;text-decoration:none;border-color:var(--green);">🌐 Open higgsfield.ai ↗</a>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px;">
          1. Save <strong>Start Frame (A)</strong> &amp; <strong>End Frame (B)</strong> above ➜ 2. Generate the video on <code>higgsfield.ai</code> with your web subscription ➜ 3. Select the downloaded <code>.mp4</code> below to splice it onto the timeline:
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <input type="file" id="customTransitionMp4Input" accept=".mp4,.mov,.webm" style="flex:1;padding:6px 8px;background:#0c0c13;border:1px solid var(--border);border-radius:7px;color:var(--text);font-size:11px;" />
          <button type="button" class="btn btn-primary" id="uploadCustomTransBtn" onclick="uploadCustomTransitionMp4()">
            📥 Insert Downloaded Higgsfield .MP4
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Higgsfield / AI Transition Engine</label>
          <select id="aiTransEngineSelect" class="btn" style="width:100%;padding:8px;">
            <option value="higgsfield_kling" selected>🚗 Higgsfield Kling Pro Start➜End Frame Morph (Recommended)</option>
            <option value="higgsfield_wan">🌐 Higgsfield Wan 3.0 Start➜End Frame ($0.043/s Best Value)</option>
            <option value="higgsfield_seedance">🎬 Higgsfield Seedance 2.5 Image-to-Video</option>
            <option value="higgsfield_dop">📹 Higgsfield DoP Standard (Camera Control Crash Zoom / Whip)</option>
            <option value="higgsfield_agent">🤖 Higgsfield AI Director Agent (Auto-Model Transition)</option>
            <option value="higgsfield_mcp">🔗 Higgsfield MCP Server (https://mcp.higgsfield.ai/mcp)</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Transition Duration on Timeline</label>
          <select id="aiTransDurationSelect" class="btn" style="width:100%;padding:8px;">
            <option value="0.55">0.55s (Fast Beat Bridge)</option>
            <option value="0.85" selected>0.85s (Standard Music Video Morph)</option>
            <option value="1.25">1.25s (Full Car / Scene Morph)</option>
          </select>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;padding:7px 10px;background:#0d0d17;border:1px solid var(--border);border-radius:8px;">
        <span id="mcpStatusText" style="font-size:11px;color:var(--muted);">🔗 MCP Endpoint: <code>https://mcp.higgsfield.ai/mcp</code> (OAuth 2.1 + SDK Ready)</span>
        <button type="button" class="btn" id="mcpConnectBtn" style="font-size:11px;padding:4px 9px;border-color:var(--cyan);" onclick="connectHiggsfieldMcp()">🔗 Authorize / Test MCP</button>
      </div>

      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-size:11px;color:var(--muted);align-self:center;">Quick Prompts:</span>
        <button type="button" class="btn" style="font-size:10px;padding:3px 7px;" onclick="document.getElementById('aiTransPromptInput').value='The car and subject physically morph and transform into the vehicle and scene in the end frame, realistic reflections, handheld hip-hop music video camera'">🚗 Car / Subject Morph</button>
        <button type="button" class="btn" style="font-size:10px;padding:3px 7px;" onclick="document.getElementById('aiTransPromptInput').value='Fast FPV crash zoom whip pan transition bridging the first scene directly into the second scene, zero cut'">📹 FPV Crash Zoom Bridge</button>
        <button type="button" class="btn" style="font-size:10px;padding:3px 7px;" onclick="document.getElementById('aiTransPromptInput').value='Subject melts into liquid chrome and reforms into the next scene on the beat drop, photorealistic VFX'">💧 Liquid Chrome Morph</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Transition Prompt (Sent to Higgsfield with Frame A + Frame B)</label>
          <input type="text" id="aiTransPromptInput" value="The car and subject physically morph and transform into the vehicle and scene in the end frame, realistic reflections, handheld hip-hop music video camera" style="width:100%;padding:7px 9px;background:#0c0c13;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Higgsfield Key (<code>api_key:api_secret</code> or set <code>HF_KEY</code> in env)</label>
          <input type="password" id="aiTransApiKeyInput" placeholder="key_id:key_secret (from cloud.higgsfield.ai)" style="width:100%;padding:7px 9px;background:#0c0c13;border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:12px;" />
        </div>
      </div>

      <div id="aiTransPreviewBox" style="display:none;margin-bottom:12px;background:#0c0c14;border:1px solid rgba(168,85,247,0.5);border-radius:8px;padding:8px;">
        <div style="font-size:11px;color:#e9d5ff;margin-bottom:4px;" id="aiTransResultLabel">✨ Generated AI Transition Preview:</div>
        <video id="aiTransPreviewVideo" controls loop autoplay muted playsinline style="width:100%;max-height:200px;border-radius:6px;background:#000;"></video>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn" onclick="closeAiTransitionModal()">Cancel</button>
        <button type="button" class="btn btn-primary" id="aiTransGenerateBtn" onclick="generateAiTransitionNow()">
          ✨ Generate &amp; Insert AI Transition Between Cuts
        </button>
      </div>
    </div>
  </div>

  <script>
    let project = null;
    let lastKnownVersion = 0;
    let wavesurfer = null;
    let wsRegions = null;
    let activeWsRegion = null;
    let playheadSec = 0.0;
    let isPlaying = false;
    let loopMode = false;
    let selStart = 0.0;
    let selEnd = 2.0;
    let selectedSegId = null;
    let customClipInOverrides = {};
    let loadedSongUrl = '';

    const programVideo = document.getElementById('programVideo');
    const statusBanner = document.getElementById('statusBanner');

    function toggleAgentsDrawer(forceOpen = null) {
      const dr = document.getElementById('agentsDrawer');
      if (forceOpen === true) {
        dr.style.display = 'flex';
      } else if (forceOpen === false) {
        dr.style.display = 'none';
      } else {
        dr.style.display = dr.style.display === 'flex' ? 'none' : 'flex';
      }
    }

    // Poll `/api/agents_status` to update live agent progress AND auto-refresh timeline as each clip agent finishes!
    async function pollAgentsTelemetry() {
      try {
        const res = await fetch('/api/agents_status');
        const data = await res.json();
        const agents = data.agents || [];
        const running = agents.filter(a => a.state === 'running');
        document.getElementById('runningAgentsCount').textContent = String(running.length);

        const listEl = document.getElementById('agentsList');
        if (agents.length > 0) {
          listEl.innerHTML = agents.map(a => `
            <div class="agent-card ${a.state}">
              <div style="display:flex;justify-content:space-between;align-items:center;font-weight:700;">
                <span>🤖 ${a.name}</span>
                <span style="color:var(--muted);font-size:10px;">${a.elapsed_sec}s • ${a.pct}%</span>
              </div>
              <div style="color:var(--muted);font-size:10px;margin-top:2px;">${a.stage}</div>
              <div class="agent-bar-bg">
                <div class="agent-bar-fill" style="width:${a.pct}%"></div>
              </div>
            </div>
          `).join('');
        }

        if (running.length > 0) {
          statusBanner.textContent = `🤖 ${running.length} parallel agent(s) working: ${running[0].name} — ${running[0].stage}`;
        }

        // If a background agent updated the project version, pull the new project state live!
        if (data.project_version && data.project_version !== lastKnownVersion) {
          const pRes = await fetch('/api/project');
          const pData = await pRes.json();
          if (pData.project) {
            loadProjectIntoUI(pData.project, true);
          }
        }
      } catch (e) {}
    }
    setInterval(pollAgentsTelemetry, 650);

    function initWavesurfer(songUrl) {
      if (wavesurfer && loadedSongUrl === songUrl) {
        syncWavesurferRegion(selStart, selEnd);
        return;
      }
      if (wavesurfer) {
        wavesurfer.destroy();
      }
      loadedSongUrl = songUrl;
      wsRegions = WaveSurfer.Regions.create();
      wavesurfer = WaveSurfer.create({
        container: '#waveformContainer',
        waveColor: '#4f46e5',
        progressColor: '#ff2a85',
        cursorColor: '#ff2a85',
        height: 32,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        interact: true,
        plugins: [wsRegions],
      });
      wavesurfer.load(songUrl);

      wavesurfer.on('ready', () => {
        syncWavesurferRegion(selStart, selEnd);
      });

      wavesurfer.on('audioprocess', (t) => {
        playheadSec = t;
        if (loopMode && playheadSec >= selEnd) {
          wavesurfer.setTime(selStart);
          playheadSec = selStart;
        }
        followPlayheadToActiveCut(playheadSec);
        syncProgramMonitor(playheadSec, true);
        updatePlayheadUI();
      });

      wavesurfer.on('seeking', (t) => {
        playheadSec = t;
        if (!loopMode) {
          selectCutAtTime(playheadSec, false);
        }
        syncProgramMonitor(playheadSec, isPlaying);
        updatePlayheadUI();
      });

      wavesurfer.on('play', () => {
        isPlaying = true;
        if (!loopMode) {
          previewingSectionInGrid = false;
          Object.values(angleCardCache).forEach(entry => {
            if (entry && entry.vid && !entry.vid.paused) entry.vid.pause();
          });
        }
        document.getElementById('playPauseBtn').textContent = '⏸️ Pause (Space)';
        syncProgramMonitor(wavesurfer.getCurrentTime(), true);
      });

      wavesurfer.on('pause', () => {
        isPlaying = false;
        loopMode = false;
        document.getElementById('playPauseBtn').textContent = '▶️ Play Master (Space)';
        programVideo.pause();
      });
    }

    function selectCutAtTime(t, seekWave = false) {
      if (!project || !project.segments || !project.segments.length) return;
      const seg = project.segments.find(s => t >= s.song_start - 0.02 && t < s.song_end)
        || (t >= project.segments[project.segments.length - 1].song_end
            ? project.segments[project.segments.length - 1]
            : project.segments[0]);
      if (!seg) return;
      if (selectedSegId !== seg.id || Math.abs(selStart - seg.song_start) > 0.04) {
        selectedSegId = seg.id;
        setSelectionRange(seg.song_start, seg.song_end, seekWave);
      }
    }

    function followPlayheadToActiveCut(t) {
      if (loopMode || !project || !project.segments || !project.segments.length) return;
      const seg = project.segments.find(s => t >= s.song_start && t < s.song_end);
      if (seg && seg.id !== selectedSegId) {
        selectedSegId = seg.id;
        setSelectionRange(seg.song_start, seg.song_end, false, true);
      }
    }

    function syncWavesurferRegion(start, end) {
      if (!wsRegions) return;
      try {
        wsRegions.clearRegions();
        activeWsRegion = wsRegions.addRegion({
          start: start,
          end: end,
          color: 'rgba(6, 182, 212, 0.24)',
          drag: false,
          resize: false,
        });
      } catch (e) {}
    }

    let currentMonitorClipUrl = '';
    let preloadedNextUrl = '';
    let useSeamlessMaster = true;
    const programVideoBuffer = document.getElementById('programVideoBuffer');

    function renderAiTransitionsBar() {
      const container = document.getElementById('aiTransitionsPills');
      const countBadge = document.getElementById('aiTransCountBadge');
      if (!container || !project || !project.segments) return;

      const aiSegs = [];
      project.segments.forEach((s, idx) => {
        if (s.cut_reason === 'ai_transition' || String(s.clip_filename || '').includes('AI_TRANS') || String(s.clip_filename || '').includes('HF_WEB')) {
          aiSegs.push({ seg: s, cutNumber: idx + 1 });
        }
      });

      if (countBadge) countBadge.textContent = String(aiSegs.length);
      container.innerHTML = '';

      if (aiSegs.length === 0) {
        container.innerHTML = '<span style="font-size:11px;color:var(--muted);">No AI transitions yet — click "✨ AI Transition" above to add one between any two cuts.</span>';
        return;
      }

      aiSegs.forEach((item, aiIdx) => {
        const s = item.seg;
        const dur = (s.song_end - s.song_start).toFixed(2);
        const cleanPair = String(s.clip_filename || '')
          .replace('✨ AI_TRANS ', '')
          .replace('✨ HF_WEB ', '');
        const isCurrent = selectedSegId === s.id || (playheadSec >= s.song_start - 0.05 && playheadSec <= s.song_end + 0.05);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ai-trans-pill';
        btn.dataset.segId = s.id;
        btn.style.cssText = `
          padding: 4px 9px;
          font-size: 11px;
          border-radius: 7px;
          white-space: nowrap;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          gap: 5px;
          background: ${isCurrent ? 'linear-gradient(135deg, #9333ea, #db2777)' : 'rgba(147, 51, 234, 0.16)'};
          border: 1px solid ${isCurrent ? '#f9a8d4' : 'rgba(168, 85, 247, 0.55)'};
          color: #fff;
          box-shadow: ${isCurrent ? '0 0 12px rgba(219, 39, 119, 0.6)' : 'none'};
        `;
        btn.innerHTML = `
          <span style="color:#f472b6;font-weight:800;">✨ #${aiIdx + 1}</span>
          <strong>Cut #${item.cutNumber}</strong>
          <span style="color:#67e8f9;font-family:monospace;">${s.song_start.toFixed(1)}s–${s.song_end.toFixed(1)}s (${dur}s)</span>
          <span style="color:#e9d5ff;font-size:10px;">${cleanPair}</span>
        `;
        btn.title = `Click to jump to ${Math.max(0, s.song_start - 0.8).toFixed(1)}s and watch AI Transition #${aiIdx + 1} (Cut #${item.cutNumber})`;
        btn.addEventListener('click', () => {
          selectedSegId = s.id;
          setSelectionRange(s.song_start, s.song_end, false);
          const leadIn = Math.max(0, s.song_start - 0.8);
          if (wavesurfer) {
            loopMode = false;
            wavesurfer.setTime(leadIn);
            playheadSec = leadIn;
            wavesurfer.play();
          }
        });
        container.appendChild(btn);
      });
    }

    function syncProgramMonitor(t, playing) {
      if (!project) return;
      document.getElementById('timecodeDisplay').textContent =
        `${t.toFixed(2)}s / ${project.song_duration.toFixed(2)}s`;

      if (!project.segments || !project.segments.length) return;
      const segIdx = project.segments.findIndex(s => t >= s.song_start && t <= s.song_end);
      const seg = segIdx >= 0
        ? project.segments[segIdx]
        : (t >= project.segments[project.segments.length - 1].song_end
            ? project.segments[project.segments.length - 1]
            : project.segments[0]);
      if (!seg) return;

      const isAiSeg = seg.cut_reason === 'ai_transition' || String(seg.clip_filename || '').includes('AI_TRANS');
      const aiHud = document.getElementById('activeAiHud');
      if (aiHud) {
        aiHud.style.display = isAiSeg ? 'inline-flex' : 'none';
      }

      // Highlight active AI transition pill if any
      document.querySelectorAll('.ai-trans-pill').forEach(btn => {
        const active = btn.dataset.segId === seg.id;
        btn.style.background = active ? 'linear-gradient(135deg, #9333ea, #db2777)' : 'rgba(147, 51, 234, 0.16)';
        btn.style.borderColor = active ? '#f9a8d4' : 'rgba(168, 85, 247, 0.55)';
      });

      // Highlight active Second pill in #secondPillsStrip
      const curIntSec = Math.floor(Math.max(0, t));
      const secInput = document.getElementById('quickSecJumpInput');
      if (secInput && document.activeElement !== secInput) {
        secInput.value = curIntSec;
      }
      document.querySelectorAll('#secondPillsStrip .sec-nav-pill').forEach(pill => {
        const pSec = parseInt(pill.dataset.sec, 10);
        pill.classList.toggle('active-sec', pSec === curIntSec);
      });

      const rawClipTime = seg.clip_in + Math.max(0, t - seg.song_start);
      const targetClipTime = Math.min(Math.max(0, rawClipTime), Math.max(0, seg.clip_out - 0.04));
      document.getElementById('activeClipHud').textContent =
        `🎬 ${seg.clip_filename} (${seg.song_start.toFixed(1)}s–${seg.song_end.toFixed(1)}s)`;
      const canUseMasterForSeg = useSeamlessMaster && Boolean(project.latest_export_url) && !loopMode && seg.cut_reason !== 'manual';
      document.getElementById('activeSyncHud').textContent =
        loopMode ? '🔁 Looping Replaced/Selected Cut' : (canUseMasterForSeg ? '⚡ Seamless Master (0 Flash)' : '🔒 Live Synced Clip');

      // Live browser preview of segment visual effect
      applyLiveMonitorEffect(seg, t - seg.song_start);

      // 1. ZERO-FLASH SEAMLESS MASTER MODE: Play the continuous rendered MP4 for unedited segments
      if (canUseMasterForSeg) {
        if (currentMonitorClipUrl !== project.latest_export_url) {
          currentMonitorClipUrl = project.latest_export_url;
          programVideo.src = project.latest_export_url;
          programVideo.currentTime = Math.max(0, t);
          if (playing) programVideo.play().catch(() => {});
        } else {
          const drift = Math.abs(programVideo.currentTime - t);
          const maxAllowedDrift = playing ? 0.85 : 0.08;
          if (drift > maxAllowedDrift) {
            programVideo.currentTime = Math.max(0, t);
          }
          if (playing && programVideo.paused) {
            programVideo.play().catch(() => {});
          } else if (!playing && !programVideo.paused) {
            programVideo.pause();
          }
        }
        return;
      }

      // 2. DOUBLE-BUFFERED LIVE PROXY FALLBACK (when user edits a cut before re-exporting)
      const nextSeg = (segIdx >= 0 && segIdx + 1 < project.segments.length) ? project.segments[segIdx + 1] : null;
      if (nextSeg && programVideoBuffer && preloadedNextUrl !== nextSeg.proxy_url) {
        preloadedNextUrl = nextSeg.proxy_url;
        programVideoBuffer.src = nextSeg.proxy_url;
        programVideoBuffer.currentTime = nextSeg.clip_in || 0;
      }

      if (currentMonitorClipUrl !== seg.proxy_url) {
        currentMonitorClipUrl = seg.proxy_url;
        programVideo.src = seg.proxy_url;
        programVideo.currentTime = targetClipTime;
        if (playing) programVideo.play().catch(() => {});
      } else {
        const drift = Math.abs(programVideo.currentTime - targetClipTime);
        if (drift > 0.18) {
          programVideo.currentTime = targetClipTime;
        }
        if (playing && programVideo.paused) {
          programVideo.play().catch(() => {});
        } else if (!playing && !programVideo.paused) {
          programVideo.pause();
        }
      }
    }

    function togglePlay() {
      if (!wavesurfer) return;
      loopMode = false;
      wavesurfer.playPause();
    }

    function loopSelectedRange() {
      if (!wavesurfer) return;
      loopMode = true;
      wavesurfer.setTime(selStart);
      wavesurfer.play();
    }

    function toggleLyricsLane() {
      const row = document.getElementById('lyricsTrackRow');
      const btn = document.getElementById('toggleLyricsBtn');
      if (!row) return;
      const hidden = row.style.display === 'none';
      row.style.display = hidden ? 'grid' : 'none';
      if (btn) btn.textContent = hidden ? '🎤 Hide Lyrics' : '🎤 Show Lyrics';
    }

    function toggleAllCameraTracks() {
      const dock = document.getElementById('timelineDock');
      const lanes = document.getElementById('clipLanesContainer');
      const btn = document.getElementById('toggleTracksBtn');
      const showing = lanes.style.display !== 'none';
      if (showing) {
        lanes.style.display = 'none';
        dock.classList.remove('expanded-tracks');
        btn.textContent = '📊 Show All Camera Tracks';
      } else {
        lanes.style.display = 'block';
        dock.classList.add('expanded-tracks');
        btn.textContent = '🔼 Hide Camera Tracks';
      }
    }

    function renderMasterScrubPins() {
      const pinsEl = document.getElementById('masterScrubPins');
      if (!pinsEl || !project || !project.segments) return;
      const dur = Math.max(0.1, project.song_duration);
      pinsEl.innerHTML = '';
      project.segments.forEach((s) => {
        const leftPct = (s.song_start / dur) * 100;
        const isAi = s.cut_reason === 'ai_transition' || String(s.clip_filename || '').includes('AI_TRANS');
        if (isAi) {
          const pin = document.createElement('div');
          pin.className = 'master-scrub-ai-pin';
          pin.style.left = leftPct + '%';
          pin.style.width = Math.max(0.6, ((s.song_end - s.song_start) / dur) * 100) + '%';
          pinsEl.appendChild(pin);
        } else {
          const tick = document.createElement('div');
          tick.style.cssText = `position:absolute;top:4px;bottom:4px;left:${leftPct}%;width:1px;background:rgba(255,255,255,0.14);`;
          pinsEl.appendChild(tick);
        }
      });
    }

    function loadProjectIntoUI(projData, preserveSelection = false) {
      project = projData;
      lastKnownVersion = projData.version || lastKnownVersion;
      const hasClips = project.clips && project.clips.length > 0;
      document.getElementById('resliceBtn').disabled = !hasClips;
      document.getElementById('exportBtn').disabled = !hasClips;
      const tExpBtn = document.getElementById('transportExportBtn');
      if (tExpBtn) tExpBtn.disabled = !hasClips;

      if (project.latest_export_url) {
        const hDl = document.getElementById('headerDownloadMp4Link');
        const tDl = document.getElementById('transportDownloadMp4Link');
        if (hDl) { hDl.href = project.latest_export_url; hDl.style.display = 'inline-flex'; }
        if (tDl) { tDl.href = project.latest_export_url; tDl.style.display = 'inline-flex'; }
      }

      if (project.cut_mode) {
        document.getElementById('cutModeSelect').value = project.cut_mode;
      }

      const syncedCount = (project.clips || []).filter(c => c.is_synced_take).length;
      const phraseCount = (project.lyrics_phrases || []).length;
      const bassCount = (project.bass_drop_times || []).length;

      document.getElementById('projectMeta').textContent =
        `${project.song_filename} (${project.bpm} BPM) • ${phraseCount} lyric lines • ${bassCount} 808 hits • ${syncedCount} synced clips`;
      document.getElementById('bassCountLabel').textContent = `${bassCount} hits`;
      document.getElementById('phraseCountLabel').textContent = `${phraseCount} lines`;
      document.getElementById('segCountLabel').textContent = `${(project.segments || []).length} cuts`;

      initWavesurfer(project.song_url);

      if (!preserveSelection) {
        if (project.segments && project.segments.length > 0) {
          const first = project.segments[0];
          selectedSegId = first.id;
          setSelectionRange(first.song_start, first.song_end, false);
        } else {
          setSelectionRange(0, Math.min(2.0, project.song_duration), false);
        }
      } else {
        setSelectionRange(selStart, selEnd, false);
      }

      renderManageClipsModalList();
      renderAiTransitionsBar();
      renderSecondPillsStrip();
      renderTrillerStrip();
      renderMasterScrubPins();
      if (!isPlaying) {
        setTimeout(() => syncProgramMonitor(selStart, false), 150);
      }
    }

    let previewingSectionInGrid = false;

    function renderSecondPillsStrip() {
      const strip = document.getElementById('secondPillsStrip');
      if (!strip || !project) return;
      const totalSec = Math.ceil(project.song_duration || 0);
      strip.innerHTML = '';
      const curIntSec = Math.floor(Math.max(0, playheadSec));

      for (let s = 0; s <= totalSec; s++) {
        const pill = document.createElement('button');
        pill.type = 'button';
        const isMajor = (s % 5 === 0);
        pill.className = 'sec-nav-pill' + (isMajor ? ' major-sec' : '') + (s === curIntSec ? ' active-sec' : '');
        pill.dataset.sec = String(s);
        pill.textContent = `${s}s`;
        pill.title = `Jump to ${s}.0s and view available clips for this section`;
        pill.addEventListener('click', () => {
          jumpToSecond(s);
        });
        strip.appendChild(pill);
      }
    }

    function jumpToSecond(targetSec) {
      if (!project) return;
      const clamped = Math.max(0, Math.min(project.song_duration - 0.05, Number(targetSec) || 0));
      if (wavesurfer && isPlaying) {
        wavesurfer.pause();
      }
      playheadSec = clamped;
      if (wavesurfer) {
        wavesurfer.setTime(clamped);
      }
      const seg = (project.segments || []).find(s => clamped >= s.song_start - 0.02 && clamped < s.song_end)
        || (project.segments || [])[0];
      if (seg) {
        selectClipFromTimeline(seg.id, true, clamped);
      } else {
        setSelectionRange(clamped, Math.min(project.song_duration, clamped + 2.0), false, false);
        syncProgramMonitor(clamped, false);
      }
      updatePlayheadUI();
      const activeSecEl = document.querySelector(`#secondPillsStrip .sec-nav-pill[data-sec="${Math.floor(clamped)}"]`);
      if (activeSecEl) {
        activeSecEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }

    function stepSecond(deltaSec) {
      if (!project) return;
      jumpToSecond(Math.round(playheadSec + deltaSec));
    }

    function selectClipFromTimeline(segId, autoPlayGridPreviews = true, explicitSeekSec = null) {
      if (!project || !project.segments) return;
      const seg = project.segments.find(s => s.id === segId);
      if (!seg) return;

      if (wavesurfer && isPlaying) {
        wavesurfer.pause();
      }
      selectedSegId = seg.id;
      previewingSectionInGrid = Boolean(autoPlayGridPreviews);
      setSelectionRange(seg.song_start, seg.song_end, true, false);
      const targetT = explicitSeekSec !== null ? explicitSeekSec : seg.song_start;
      playheadSec = targetT;
      if (wavesurfer) {
        wavesurfer.setTime(targetT);
      }
      syncProgramMonitor(targetT, false);
      updatePlayheadUI();

      // Scroll the right-hand Available Clips pane to the top so user immediately sees all cameras for this section
      const takesScroll = document.getElementById('takesScrollContainer');
      if (takesScroll) {
        takesScroll.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }

    function setSelectionRange(start, end, seekWave = true, fromPlayheadFollow = false) {
      if (!project) return;
      selStart = Math.max(0, Math.min(start, project.song_duration - 0.1));
      selEnd = Math.max(selStart + 0.15, Math.min(end, project.song_duration));

      document.getElementById('selStartInput').value = selStart.toFixed(2);
      document.getElementById('selEndInput').value = selEnd.toFixed(2);
      document.getElementById('selDurLabel').textContent = `(${(selEnd - selStart).toFixed(2)}s)`;

      const segIdx = (project.segments || []).findIndex(
        s => s.id === selectedSegId || (Math.abs(s.song_start - selStart) < 0.05 && Math.abs(s.song_end - selEnd) < 0.05)
      );
      const matchSeg = segIdx >= 0 ? project.segments[segIdx] : null;
      selectedSegId = matchSeg ? matchSeg.id : null;
      const totalCuts = (project.segments || []).length;

      if (matchSeg) {
        document.getElementById('segEffectSelect').value = matchSeg.effect || 'none';
        document.getElementById('activeCutIndexLabel').textContent =
          `🎯 Cut #${segIdx + 1} of ${totalCuts} (${matchSeg.song_start.toFixed(1)}s–${matchSeg.song_end.toFixed(1)}s)`;
        document.getElementById('syncBinTitle').textContent =
          `🎥 Available Clips for Cut #${segIdx + 1} (${matchSeg.song_start.toFixed(1)}s–${matchSeg.song_end.toFixed(1)}s)`;
        document.getElementById('segReasonBadge').textContent =
          formatCutReason(matchSeg.cut_reason);
      } else {
        document.getElementById('activeCutIndexLabel').textContent =
          `🎯 Custom Window (${selStart.toFixed(1)}s–${selEnd.toFixed(1)}s)`;
        document.getElementById('syncBinTitle').textContent =
          `🎥 Available Clips for ${selStart.toFixed(1)}s–${selEnd.toFixed(1)}s`;
        document.getElementById('segReasonBadge').textContent = 'Custom Window';
      }

      syncWavesurferRegion(selStart, selEnd);
      if (seekWave && wavesurfer) {
        loopMode = false;
        wavesurfer.setTime(selStart);
        playheadSec = selStart;
      }
      if (fromPlayheadFollow) {
        previewingSectionInGrid = false;
        // Lightweight in-place update during playback so DOM nodes & preview <video> elements NEVER flash!
        const dur = Math.max(0.1, project.song_duration);
        document.querySelectorAll('.range-highlight').forEach(hl => {
          hl.style.left = ((selStart / dur) * 100) + '%';
          hl.style.width = (((selEnd - selStart) / dur) * 100) + '%';
        });
        document.querySelectorAll('#assembledLane .assembled-seg').forEach((el, i) => {
          const s = project.segments[i];
          el.classList.toggle('selected', Boolean(s && s.id === selectedSegId));
        });
        document.querySelectorAll('#trillerSegmentStrip .triller-cut-pill').forEach((pill, i) => {
          const s = project.segments[i];
          const active = Boolean(s && s.id === selectedSegId);
          pill.classList.toggle('active-cut', active);
          if (active) {
            pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        });
        renderTakePicker(true);
      } else {
        renderTimeline();
        renderTrillerStrip();
        renderTakePicker(false);
      }
    }

    let currentTimelineZoom = 1;
    function setTimelineZoom(zoomFactor) {
      currentTimelineZoom = zoomFactor;
      const inner = document.getElementById('timelineZoomInner');
      if (inner) {
        inner.style.minWidth = (zoomFactor * 100) + '%';
      }
      if (wavesurfer && project && project.song_duration) {
        try {
          const containerW = document.getElementById('timelineScroll').clientWidth - 190;
          const pxPerSec = Math.max(5, (containerW * zoomFactor) / project.song_duration);
          wavesurfer.zoom(pxPerSec);
        } catch (e) {}
      }
      [1, 2, 4, 8].forEach(z => {
        const b = document.getElementById('zoomBtn' + z);
        if (b) b.classList.toggle('btn-primary', z === zoomFactor);
      });
      setTimeout(() => {
        const selEl = document.querySelector('#assembledLane .assembled-seg.selected');
        if (selEl) selEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }, 60);
    }

    function stepCutSelection(delta) {
      if (!project || !project.segments || !project.segments.length) return;
      let idx = project.segments.findIndex(s => s.id === selectedSegId);
      if (idx === -1) {
        idx = project.segments.findIndex(s => selStart >= s.song_start - 0.05 && selStart < s.song_end);
      }
      if (idx === -1) idx = 0;
      const nextIdx = Math.max(0, Math.min(project.segments.length - 1, idx + delta));
      const seg = project.segments[nextIdx];
      selectClipFromTimeline(seg.id, true);
    }

    function renderTrillerStrip() {
      const strip = document.getElementById('trillerSegmentStrip');
      const totalBadge = document.getElementById('clipNavTotalCount');
      if (!strip) return;
      if (!project || !project.segments || !project.segments.length) {
        strip.innerHTML = '';
        if (totalBadge) totalBadge.textContent = '0';
        return;
      }
      if (totalBadge) totalBadge.textContent = String(project.segments.length);
      const clipColorMap = {};
      (project.clips || []).forEach(c => { clipColorMap[c.clip_id] = c.color; });
      const syncedClips = (project.clips || []).filter(c => c.is_synced_take);

      strip.innerHTML = '';
      project.segments.forEach((seg, idx) => {
        const isSel = seg.id === selectedSegId ||
          (Math.abs(seg.song_start - selStart) < 0.04 && Math.abs(seg.song_end - selEnd) < 0.04);
        const isAi = seg.cut_reason === 'ai_transition' || String(seg.clip_filename || '').includes('AI_TRANS');
        const alignedCount = syncedClips.filter(
          c => seg.song_start >= c.active_song_start - 0.35 && seg.song_end <= c.active_song_end + 0.35
        ).length;

        const pill = document.createElement('div');
        pill.className = 'triller-cut-pill' + (isAi ? ' ai-cut' : '') + (isSel ? ' active-cut' : '');
        const cColor = isAi ? '#e879f9' : (clipColorMap[seg.clip_id] || '#ff2a85');
        const cleanName = String(seg.clip_filename || '').replace('✨ AI_TRANS ', '✨ ');
        pill.innerHTML = `
          <div class="seg-top">
            <span>${isAi ? '✨' : '🎬'} Cut #${idx + 1} • ${seg.song_start.toFixed(1)}s–${seg.song_end.toFixed(1)}s</span>
            <span class="angles-badge">🎥 ${alignedCount || 1} clip${alignedCount === 1 ? '' : 's'}</span>
          </div>
          <div class="seg-clip">
            <span class="color-dot" style="background:${cColor}"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;" title="${seg.clip_filename}">${cleanName}</span>
          </div>
        `;
        pill.addEventListener('click', () => {
          selectClipFromTimeline(seg.id, true);
        });
        strip.appendChild(pill);
        if (isSel) {
          setTimeout(() => {
            pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }, 40);
        }
      });
    }

    function formatCutReason(r) {
      if (r === 'ai_transition') return '✨ AI Frame-to-Frame Transition';
      if (r === 'lyric+808') return '🎤 Lyric Line + 🥁 808 Hit';
      if (r === 'lyric_line' || r === 'lyric_end') return '🎤 Lyric Line Boundary';
      if (r === '808_hit') return '🥁 808 Bass Hit';
      if (r === 'manual') return '✋ User Selected Angle';
      return r || 'Beat / Lyric';
    }

    function onManualRangeChange() {
      const s = parseFloat(document.getElementById('selStartInput').value) || 0;
      const e = parseFloat(document.getElementById('selEndInput').value) || (s + 2.0);
      setSelectionRange(s, e, true);
    }

    function setInAtPlayhead() {
      const newStart = playheadSec;
      const newEnd = Math.max(newStart + 0.5, selEnd);
      setSelectionRange(newStart, newEnd, false);
    }

    function setOutAtPlayhead() {
      if (playheadSec <= selStart + 0.1) {
        setSelectionRange(Math.max(0, playheadSec - 2.0), playheadSec, false);
      } else {
        setSelectionRange(selStart, playheadSec, false);
      }
    }

    function renderTimeline() {
      if (!project) return;
      const dur = Math.max(0.1, project.song_duration);
      document.getElementById('segCountLabel').textContent = `${(project.segments || []).length} cuts`;

      const ruler = document.getElementById('rulerLane');
      ruler.innerHTML = '';
      const step = dur > 90 ? 10 : dur > 35 ? 5 : 2;
      for (let t = 0; t <= dur; t += step) {
        const tick = document.createElement('div');
        tick.className = 'ruler-tick';
        tick.style.left = ((t / dur) * 100) + '%';
        tick.textContent = `${t}s`;
        ruler.appendChild(tick);
      }
      (project.bass_drop_times || []).forEach(b808 => {
        const pin = document.createElement('div');
        pin.className = 'bass-hit-pin';
        pin.style.left = ((b808 / dur) * 100) + '%';
        pin.title = `🥁 808 Bass Hit @ ${b808.toFixed(2)}s`;
        ruler.appendChild(pin);
      });
      appendOverlaysToLane(ruler, dur);

      const lyricsLane = document.getElementById('lyricsLane');
      lyricsLane.innerHTML = '';
      (project.lyrics_phrases || []).forEach(phrase => {
        const lPct = (phrase.start / dur) * 100;
        const wPct = Math.max(0.8, ((phrase.end - phrase.start) / dur) * 100);
        const chip = document.createElement('div');
        chip.className = 'lyric-chip';
        chip.style.left = lPct + '%';
        chip.style.width = wPct + '%';
        chip.textContent = phrase.text;
        chip.title = `🎤 [${phrase.start}s - ${phrase.end}s] "${phrase.text}" (Click to jump to this lyric cut)`;
        chip.addEventListener('click', () => {
          selectCutAtTime(phrase.start + 0.05, true);
          syncProgramMonitor(selStart, false);
        });
        lyricsLane.appendChild(chip);
      });
      appendOverlaysToLane(lyricsLane, dur);

      const assembled = document.getElementById('assembledLane');
      assembled.innerHTML = '';
      const clipColorMap = {};
      (project.clips || []).forEach(c => { clipColorMap[c.clip_id] = c.color; });

      (project.segments || []).forEach((seg, idx) => {
        const leftPct = (seg.song_start / dur) * 100;
        const widthPct = ((seg.song_end - seg.song_start) / dur) * 100;
        const el = document.createElement('div');
        el.className = 'assembled-seg' + (seg.id === selectedSegId ? ' selected' : '');
        el.style.left = leftPct + '%';
        el.style.width = Math.max(widthPct, 0.4) + '%';
        el.style.background = seg.cut_reason === 'ai_transition'
          ? 'linear-gradient(135deg, #a855f7, #ec4899)'
          : (clipColorMap[seg.clip_id] || '#ff2a85');

        const icon = seg.cut_reason === 'ai_transition' ? '✨'
          : (seg.cut_reason === 'lyric+808' ? '🎤🥁'
          : (seg.cut_reason && seg.cut_reason.startsWith('lyric') ? '🎤'
          : (seg.cut_reason === '808_hit' ? '🥁' : '')));

        el.title = `Cut #${idx + 1}: ${seg.clip_filename} (${seg.song_start.toFixed(2)}s–${seg.song_end.toFixed(2)}s)`;

        const labelSpan = document.createElement('span');
        labelSpan.style.overflow = 'hidden';
        labelSpan.style.textOverflow = 'ellipsis';
        labelSpan.style.whiteSpace = 'nowrap';
        labelSpan.textContent = `#${idx + 1} ${seg.clip_filename}`;
        el.appendChild(labelSpan);

        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectClipFromTimeline(seg.id, true);
        });
        assembled.appendChild(el);
      });
      appendOverlaysToLane(assembled, dur);

      const lanesContainer = document.getElementById('clipLanesContainer');
      lanesContainer.innerHTML = '';

      const syncedClips = (project.clips || []).filter(c => c.is_synced_take);
      syncedClips.forEach((clip, idx) => {
        const row = document.createElement('div');
        row.className = 'track-row';

        const lbl = document.createElement('div');
        lbl.className = 'track-label';
        lbl.innerHTML = `
          <span title="${clip.filename}" style="overflow:hidden;text-overflow:ellipsis;">
            <span class="color-dot" style="background:${clip.color}"></span> ${idx + 1}. ${clip.filename}
          </span>
          <span style="font-size:10px;color:var(--green)">${clip.active_song_start.toFixed(1)}s–${clip.active_song_end.toFixed(1)}s</span>
        `;

        const lane = document.createElement('div');
        lane.className = 'track-lane';

        const bar = document.createElement('div');
        bar.className = 'clip-bar';
        bar.style.background = clip.color;

        const barStart = clip.active_song_start;
        const barEnd = clip.active_song_end;
        const leftPct = (barStart / dur) * 100;
        const widthPct = Math.max(1.0, ((barEnd - barStart) / dur) * 100);
        bar.style.left = leftPct + '%';
        bar.style.width = widthPct + '%';
        bar.textContent = `${clip.filename} (${barStart.toFixed(1)}s–${barEnd.toFixed(1)}s)`;

        bar.addEventListener('click', () => {
          if (selStart >= barStart - 0.35 && selEnd <= barEnd + 0.35) {
            swapAngleAndLoopPreview(clip, Math.max(clip.usable_start_sec, selStart - clip.song_offset_sec));
          } else {
            selectCutAtTime(barStart + 0.05, true);
            syncProgramMonitor(selStart, false);
          }
        });

        lane.appendChild(bar);
        appendOverlaysToLane(lane, dur);
        row.appendChild(lbl);
        row.appendChild(lane);
        lanesContainer.appendChild(row);
      });
    }

    function appendOverlaysToLane(laneEl, dur) {
      const hl = document.createElement('div');
      hl.className = 'range-highlight';
      hl.style.left = ((selStart / dur) * 100) + '%';
      hl.style.width = (((selEnd - selStart) / dur) * 100) + '%';
      laneEl.appendChild(hl);

      const ph = document.createElement('div');
      ph.className = 'playhead-line';
      ph.style.left = ((playheadSec / dur) * 100) + '%';
      laneEl.appendChild(ph);
    }

    function updatePlayheadUI() {
      if (!project) return;
      const dur = Math.max(0.1, project.song_duration);
      const pctNum = Math.max(0, Math.min(100, (playheadSec / dur) * 100));
      const pct = pctNum + '%';
      document.querySelectorAll('.playhead-line').forEach(el => {
        el.style.left = pct;
      });
      const fill = document.getElementById('masterScrubFill');
      const thumb = document.getElementById('masterScrubThumb');
      if (fill) fill.style.width = pct;
      if (thumb) thumb.style.left = pct;
    }

    // Clicking or dragging the ruler or master scrub bar jumps cleanly to the timestamp!
    (function setupRulerAndScrubber() {
      const ruler = document.getElementById('rulerLane');
      if (ruler) {
        ruler.addEventListener('click', (e) => {
          if (!project) return;
          const rect = ruler.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          const clickedSec = ratio * project.song_duration;
          selectCutAtTime(clickedSec, true);
          syncProgramMonitor(selStart, false);
        });
      }

      const scrub = document.getElementById('masterScrubWrap');
      if (scrub) {
        let isScrubbing = false;
        const seekFromEvent = (e) => {
          if (!project) return;
          const rect = scrub.getBoundingClientRect();
          const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
          const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
          const targetSec = ratio * project.song_duration;
          playheadSec = targetSec;
          if (wavesurfer) wavesurfer.setTime(targetSec);
          selectCutAtTime(targetSec, false);
          syncProgramMonitor(targetSec, isPlaying);
          updatePlayheadUI();
        };
        scrub.addEventListener('mousedown', (e) => { isScrubbing = true; seekFromEvent(e); });
        window.addEventListener('mousemove', (e) => { if (isScrubbing) seekFromEvent(e); });
        window.addEventListener('mouseup', () => { isScrubbing = false; });
        scrub.addEventListener('touchstart', (e) => { isScrubbing = true; seekFromEvent(e); }, { passive: true });
        scrub.addEventListener('touchmove', (e) => { if (isScrubbing) seekFromEvent(e); }, { passive: true });
        scrub.addEventListener('touchend', () => { isScrubbing = false; });
      }
    })();

    let currentHotAngles = [];
    let currentAngleFilter = 'all';

    function setAngleFilter(mode) {
      currentAngleFilter = mode || 'all';
      ['all', 'synced', 'energy'].forEach(m => {
        const btn = document.getElementById('angleFilter' + m.charAt(0).toUpperCase() + m.slice(1));
        if (btn) btn.classList.toggle('active', m === currentAngleFilter);
      });
      renderTakePicker(true);
    }

    function computeWindowEnergy(clip, clipIn, winDur) {
      const curve = clip.visual_energy_curve;
      if (!curve || !curve.length) return 0.55;
      const i0 = Math.max(0, Math.min(curve.length - 1, Math.floor(clipIn * 4)));
      const i1 = Math.max(i0 + 1, Math.min(curve.length, Math.ceil((clipIn + winDur) * 4)));
      const slice = curve.slice(i0, i1);
      if (!slice.length) return 0.55;
      const sum = slice.reduce((acc, v) => acc + v, 0);
      return Math.max(0.12, Math.min(1.0, sum / slice.length));
    }

    async function swapAngleAndLoopPreview(clip, chosenIn) {
      await insertClipIntoSelection(clip.clip_id, chosenIn);
      // Immediately play/loop the newly chosen angle WITH master song audio so user hears & sees lip-sync!
      if (wavesurfer) {
        loopMode = true;
        wavesurfer.setTime(selStart);
        wavesurfer.play();
      }
    }

    const angleCardCache = {};

    function getOrCreateAngleCard(item, hotKeyNum, activeClipId, winDur, fromPlayheadFollow = false, cutNumberLabel = '') {
      const { clip, coversActiveSong, defaultClipIn, winEnergy } = item;
      const energyPct = Math.round(winEnergy * 100);
      const isCurrentActive = clip.clip_id === activeClipId;

      const keyLabel = hotKeyNum
        ? (isCurrentActive ? `✓ ACTIVE IN TIMELINE [Key ${hotKeyNum}]` : `Press [${hotKeyNum}] or Click to Replace`)
        : (isCurrentActive ? '✓ ACTIVE IN TIMELINE' : 'Click to Replace');

      const subInfo = coversActiveSong
        ? `🔒 Synced Section @ ${defaultClipIn.toFixed(1)}s–${(defaultClipIn + winDur).toFixed(1)}s`
        : `🎞️ B-Roll (Song @ ${clip.active_song_start.toFixed(1)}s–${clip.active_song_end.toFixed(1)}s)`;

      const ctaText = isCurrentActive
        ? `✓ Current Clip in ${cutNumberLabel || 'Selected Cut'}`
        : `🔄 Click to Replace ${cutNumberLabel || 'Selected Cut'} with This Section (${defaultClipIn.toFixed(1)}s–${(defaultClipIn + winDur).toFixed(1)}s)`;

      let entry = angleCardCache[clip.clip_id];
      if (!entry) {
        const card = document.createElement('div');
        card.className = 'take-card';
        card.innerHTML = `
          <div class="take-video-wrap">
            <video src="${clip.proxy_url}#t=0.5" muted playsinline loop preload="metadata"></video>
            <span class="take-key-badge"></span>
            <span class="take-energy-badge"></span>
          </div>
          <div class="take-body">
            <div class="take-title">
              <span style="display:flex;align-items:center;gap:5px;overflow:hidden;">
                <span class="color-dot" style="background:${clip.color}"></span>
                <span title="${clip.filename}" style="overflow:hidden;text-overflow:ellipsis;">${clip.filename}</span>
              </span>
              <span class="take-subinfo" style="font-size:10px;font-weight:700;"></span>
            </div>
            <div class="take-energy-meter">
              <div class="take-energy-meter-fill"></div>
            </div>
            <div class="take-replace-cta"></div>
          </div>
        `;
        const vid = card.querySelector('video');
        entry = {
          card,
          vid,
          keyBadge: card.querySelector('.take-key-badge'),
          energyBadge: card.querySelector('.take-energy-badge'),
          subInfoEl: card.querySelector('.take-subinfo'),
          energyMeterFill: card.querySelector('.take-energy-meter-fill'),
          replaceCtaEl: card.querySelector('.take-replace-cta'),
          clip,
          defaultClipIn,
          winDur,
        };
        card.addEventListener('mouseenter', () => {
          entry.vid.currentTime = entry.defaultClipIn;
          entry.vid.play().catch(() => {});
        });
        card.addEventListener('mouseleave', () => {
          if (!previewingSectionInGrid) {
            entry.vid.pause();
          }
        });
        vid.addEventListener('timeupdate', () => {
          if (entry.vid.currentTime >= Math.min(entry.clip.usable_end_sec, entry.defaultClipIn + entry.winDur)) {
            entry.vid.currentTime = entry.defaultClipIn;
          }
        });
        card.addEventListener('click', () => {
          swapAngleAndLoopPreview(entry.clip, entry.defaultClipIn);
        });
        angleCardCache[clip.clip_id] = entry;
      }

      // Update mutable properties in-place without ever recreating or reloading the <video> element!
      entry.defaultClipIn = defaultClipIn;
      entry.winDur = winDur;
      entry.card.className = 'take-card' + (isCurrentActive ? ' active-take' : '');
      entry.keyBadge.textContent = keyLabel;
      entry.energyBadge.textContent = `⚡ ${energyPct}% Energy`;
      entry.subInfoEl.textContent = subInfo;
      entry.subInfoEl.style.color = coversActiveSong ? 'var(--green)' : 'var(--muted)';
      if (entry.energyMeterFill) {
        entry.energyMeterFill.style.width = `${energyPct}%`;
      }
      if (entry.replaceCtaEl) {
        entry.replaceCtaEl.textContent = ctaText;
      }

      // Filter visibility in-place (preserving <video> decoder state!)
      let visible = true;
      if (currentAngleFilter === 'synced' && !coversActiveSong && !isCurrentActive) {
        visible = false;
      } else if (currentAngleFilter === 'energy' && energyPct < 60 && !isCurrentActive) {
        visible = false;
      }
      entry.card.style.display = visible ? 'flex' : 'none';

      // When user clicks a clip on the timeline to inspect/replace it, seek & auto-play the section in the preview grid!
      if (!fromPlayheadFollow && visible) {
        const targetThumbT = Math.min(defaultClipIn, Math.max(0, clip.duration - 0.1));
        if (Math.abs(entry.vid.currentTime - targetThumbT) > 0.35) {
          entry.vid.currentTime = targetThumbT;
        }
        if (previewingSectionInGrid && !isPlaying) {
          entry.vid.play().catch(() => {});
        }
      } else if (fromPlayheadFollow && !entry.vid.paused) {
        entry.vid.pause();
      }

      return entry.card;
    }

    function renderTakePicker(fromPlayheadFollow = false) {
      const grid = document.getElementById('takesGrid');
      const brollContainer = document.getElementById('brollContainer');

      if (!project || !project.clips || !project.clips.length) {
        grid.innerHTML = `<div style="color:var(--muted);font-size:13px;grid-column:1/-1;padding:32px;text-align:center;">
          No video clips in project. Click <strong>➕ Manage Videos</strong> to launch parallel Sync Agents.
        </div>`;
        if (brollContainer) brollContainer.innerHTML = '';
        return;
      }

      const activeSegIdx = (project.segments || []).findIndex(
        s => s.id === selectedSegId || (Math.abs(s.song_start - selStart) < 0.05 && Math.abs(s.song_end - selEnd) < 0.05)
      );
      const activeSeg = activeSegIdx >= 0 ? project.segments[activeSegIdx] : null;
      const activeClipId = activeSeg ? activeSeg.clip_id : null;
      const cutNumberLabel = activeSegIdx >= 0 ? `Cut #${activeSegIdx + 1}` : `${selStart.toFixed(1)}s–${selEnd.toFixed(1)}s`;
      const winDur = Math.max(0.15, selEnd - selStart);

      const syncedClips = project.clips.filter(c => c.is_synced_take);
      const scoredClips = syncedClips.map(clip => {
        const coversActiveSong =
          (selStart >= clip.active_song_start - 0.35) &&
          (selEnd <= clip.active_song_end + 0.35);
        const rawClipIn = selStart - clip.song_offset_sec;
        const defaultClipIn = coversActiveSong
          ? Math.max(clip.usable_start_sec, Math.min(rawClipIn, Math.max(clip.usable_start_sec, clip.usable_end_sec - winDur)))
          : (customClipInOverrides[clip.clip_id] ?? clip.usable_start_sec);
        const winEnergy = computeWindowEnergy(clip, defaultClipIn, winDur);
        return { clip, coversActiveSong, defaultClipIn, winEnergy };
      });

      currentHotAngles = scoredClips.slice(0, 9);
      const directCount = scoredClips.filter(x => x.coversActiveSong).length;

      const subtitle = document.getElementById('syncBinSubtitle');
      if (subtitle) {
        subtitle.innerHTML = directCount > 0
          ? `<strong style="color:var(--green);">${directCount} Available Synced Clip${directCount === 1 ? '' : 's'}</strong> for ${cutNumberLabel} (${selStart.toFixed(1)}s–${selEnd.toFixed(1)}s) • <strong>Click any video preview below to replace ${cutNumberLabel}</strong>`
          : `<span style="color:var(--amber);">Instrumental / Outro Section — Click any clip preview below to replace ${cutNumberLabel}</span>`;
      }

      if (brollContainer) brollContainer.innerHTML = '';

      scoredClips.forEach((item, idx) => {
        const card = getOrCreateAngleCard(item, idx + 1 <= 9 ? idx + 1 : null, activeClipId, winDur, fromPlayheadFollow, cutNumberLabel);
        if (card.parentElement !== grid) {
          grid.appendChild(card);
        }
      });
    }

    function renderManageClipsModalList() {
      const list = document.getElementById('manageClipsList');
      const countSpan = document.getElementById('modalClipCount');
      if (!project || !project.clips) {
        list.innerHTML = '';
        countSpan.textContent = '0';
        return;
      }
      countSpan.textContent = String(project.clips.length);
      list.innerHTML = '';

      project.clips.forEach((c) => {
        const div = document.createElement('div');
        div.className = 'clip-manage-item';
        const statusBadge = c.is_synced_take
          ? `<span style="color:var(--green);font-weight:700;">Synced @ ${c.active_song_start.toFixed(1)}s–${c.active_song_end.toFixed(1)}s</span>`
          : `<span style="color:var(--amber);">Ignored (No Song Detected)</span>`;
        div.innerHTML = `
          <div>
            <strong><span class="color-dot" style="background:${c.color}"></span> ${c.filename}</strong>
            <span style="color:var(--muted);margin-left:6px;">(${c.duration.toFixed(1)}s)</span>
            <div style="font-size:11px;margin-top:2px;">${statusBadge}</div>
          </div>
          <button class="btn btn-danger" onclick="deleteClip('${c.clip_id}', '${c.filename}')">🗑️ Delete Clip</button>
        `;
        list.appendChild(div);
      });
    }

    async function deleteClip(clipId, filename) {
      if (!confirm(`Delete "${filename}" from the project?`)) return;
      statusBanner.textContent = `🗑️ Deleting ${filename} and updating timeline...`;
      try {
        const res = await fetch('/api/delete_clip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clip_id: clipId }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to delete clip');
        loadProjectIntoUI(data.project, true);
        statusBanner.textContent = `✅ Deleted ${filename}.`;
      } catch (err) {
        statusBanner.textContent = '❌ Error: ' + err.message;
      }
    }

    async function insertClipIntoSelection(clipId, explicitClipIn = null) {
      if (!project) return;
      const clip = project.clips.find(c => c.clip_id === clipId);
      if (!clip) return;

      const sStart = Number(selStart.toFixed(3));
      const sEnd = Number(selEnd.toFixed(3));
      const segDur = Math.max(0.15, sEnd - sStart);

      const coversActive = clip.is_synced_take &&
        (sStart >= clip.active_song_start - 0.35) &&
        (sEnd <= clip.active_song_end + 0.35);

      let cIn = explicitClipIn !== null
        ? explicitClipIn
        : (coversActive ? Math.max(clip.usable_start_sec, sStart - clip.song_offset_sec) : clip.usable_start_sec);

      cIn = Math.max(clip.usable_start_sec, Math.min(cIn, Math.max(clip.usable_start_sec, clip.usable_end_sec - 0.1)));
      const cOut = Math.min(clip.usable_end_sec, cIn + segDur);

      const effectVal = document.getElementById('segEffectSelect').value || 'none';
      const updated = [];
      const eps = 0.04;

      for (const seg of (project.segments || [])) {
        if (seg.song_end <= sStart + eps || seg.song_start >= sEnd - eps) {
          updated.push(seg);
          continue;
        }
        if (seg.song_start < sStart - eps) {
          const leftDur = sStart - seg.song_start;
          updated.push({
            ...seg,
            id: `seg_${Date.now()}_L_${Math.random().toString(36).slice(2, 6)}`,
            song_end: sStart,
            clip_out: Number((seg.clip_in + leftDur).toFixed(3)),
          });
        }
        if (seg.song_end > sEnd + eps) {
          const cutOffset = sEnd - seg.song_start;
          updated.push({
            ...seg,
            id: `seg_${Date.now()}_R_${Math.random().toString(36).slice(2, 6)}`,
            song_start: sEnd,
            clip_in: Number((seg.clip_in + cutOffset).toFixed(3)),
          });
        }
      }

      const newSegId = `seg_${Date.now()}_N`;
      updated.push({
        id: newSegId,
        index: 0,
        song_start: sStart,
        song_end: sEnd,
        clip_id: clip.clip_id,
        clip_filename: clip.filename,
        clip_filepath: clip.filepath,
        proxy_url: clip.proxy_url,
        clip_in: Number(cIn.toFixed(3)),
        clip_out: Number(cOut.toFixed(3)),
        is_synced: coversActive,
        effect: effectVal,
        beat_energy: 0.75,
        cut_reason: 'manual',
      });

      updated.sort((a, b) => a.song_start - b.song_start);
      updated.forEach((s, i) => { s.index = i; });
      project.segments = updated;
      selectedSegId = newSegId;
      useSeamlessMaster = false;

      statusBanner.textContent = `✓ Replaced clip with ${clip.filename} at song ${sStart.toFixed(2)}s–${sEnd.toFixed(2)}s (Clip section ${cIn.toFixed(2)}s–${cOut.toFixed(2)}s)`;
      renderTimeline();
      renderTrillerStrip();
      renderTakePicker(false);
      syncProgramMonitor(sStart, false);
      await saveSegmentsToServer();
    }

    async function splitSegmentAtPlayhead() {
      if (!project || !project.segments) return;
      const t = Number(playheadSec.toFixed(3));
      const idx = project.segments.findIndex(s => t > s.song_start + 0.2 && t < s.song_end - 0.2);
      if (idx === -1) {
        statusBanner.textContent = 'Move playhead inside a segment to split it.';
        return;
      }
      const seg = project.segments[idx];
      const firstDur = t - seg.song_start;
      const segA = {
        ...seg,
        id: `seg_${Date.now()}_A`,
        song_end: t,
        clip_out: Number((seg.clip_in + firstDur).toFixed(3)),
      };
      const segB = {
        ...seg,
        id: `seg_${Date.now()}_B`,
        song_start: t,
        clip_in: Number((seg.clip_in + firstDur).toFixed(3)),
        cut_reason: 'manual',
      };
      project.segments.splice(idx, 1, segA, segB);
      project.segments.forEach((s, i) => { s.index = i; });
      setSelectionRange(segB.song_start, segB.song_end, false);
      statusBanner.textContent = `✂️ Split segment at ${t.toFixed(2)}s`;
      await saveSegmentsToServer();
    }

    async function updateSelectedSegmentEffect(effect) {
      if (!project || !selectedSegId) return;
      const seg = project.segments.find(s => s.id === selectedSegId);
      if (seg) {
        seg.effect = effect;
        statusBanner.textContent = `Updated FX to "${effect}" for ${seg.song_start.toFixed(1)}s–${seg.song_end.toFixed(1)}s`;
        await saveSegmentsToServer();
      }
    }

    async function saveSegmentsToServer() {
      if (!project) return;
      useSeamlessMaster = false;
      const res = await fetch('/api/update_segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: project.segments }),
      });
      const data = await res.json();
      if (data.version) lastKnownVersion = data.version;
      renderAiTransitionsBar();
    }

    async function resliceWithMode(mode, preserveTiming = true) {
      useSeamlessMaster = false;
      statusBanner.textContent = preserveTiming
        ? `🎲 Re-cutting: keeping cut timings & swapping to random aligned takes...`
        : `🎲 Generating new cuts using mode: ${mode}...`;
      const res = await fetch('/api/reslice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cut_mode: mode, preserve_timing: preserveTiming }),
      });
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project, true);
        syncProgramMonitor(playheadSec, false);
        statusBanner.textContent = preserveTiming
          ? `✅ Re-cut ${data.project.segments.length} cuts with randomized aligned video clips!`
          : `✅ Generated ${data.project.segments.length} cuts using mode "${mode}"!`;
      }
    }

    async function exportFinalVideo() {
      const btn = document.getElementById('exportBtn');
      const colorGrade = (document.getElementById('colorGradeSelect') || {}).value || 'none';
      const qualityMode = (document.getElementById('qualityModeSelect') || {}).value || 'cas_crisp';
      btn.disabled = true;
      toggleAgentsDrawer(true);
      statusBanner.textContent = `🎬 Parallel Render Agents encoding 1080p MP4 (Grade: ${colorGrade}, Enhance: ${qualityMode})...`;
      try {
        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color_grade: colorGrade, quality_mode: qualityMode }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Export failed');
        if (project) {
          project.latest_export_url = data.video_url;
          useSeamlessMaster = true;
        }
        statusBanner.textContent = `✅ Master 1080p MP4 exported with ${colorGrade} + ${qualityMode}!`;
        const player = document.getElementById('exportedVideoPlayer');
        player.src = data.video_url + '?t=' + Date.now();
        document.getElementById('exportPathText').textContent = data.output_path;
        document.getElementById('downloadExportLink').href = data.video_url;
        document.getElementById('exportModal').style.display = 'flex';
      } catch (err) {
        statusBanner.textContent = '❌ Export error: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    }

    function openSongModal() { document.getElementById('songModal').style.display = 'flex'; }
    function closeSongModal() { document.getElementById('songModal').style.display = 'none'; }
    function openAddClipsModal() {
      renderManageClipsModalList();
      document.getElementById('addClipsModal').style.display = 'flex';
    }
    function closeAddClipsModal() { document.getElementById('addClipsModal').style.display = 'none'; }

    function getMasterGradeCssFilter() {
      const grade = (document.getElementById('colorGradeSelect') || {}).value || 'none';
      const qual = (document.getElementById('qualityModeSelect') || {}).value || 'cas_crisp';
      const parts = [];
      if (grade === 'kodak_2383') {
        parts.push('contrast(1.08) saturate(1.09) brightness(1.02)');
      } else if (grade === 'night_trap') {
        parts.push('contrast(1.13) saturate(1.16) hue-rotate(-5deg)');
      } else if (grade === 'bleach_bypass') {
        parts.push('contrast(1.24) saturate(0.66) brightness(0.98)');
      } else if (grade === 'warm_vintage') {
        parts.push('sepia(0.16) contrast(1.06) saturate(1.12)');
      }
      if (qual === 'ultra_cinema') {
        parts.push('contrast(1.04)');
      }
      return parts.join(' ');
    }

    function onMasterLookChange() {
      if (!project || !project.segments || !project.segments.length) return;
      const seg = project.segments.find(s => playheadSec >= s.song_start && playheadSec <= s.song_end) || project.segments[0];
      applyLiveMonitorEffect(seg, Math.max(0, playheadSec - seg.song_start));
      const g = document.getElementById('colorGradeSelect').value;
      const q = document.getElementById('qualityModeSelect').value;
      statusBanner.textContent = `🎨 Live Look Updated: Grade="${g}" + Enhance="${q}"`;
    }

    function applyLiveMonitorEffect(seg, relSec) {
      const fx = seg.effect || 'none';
      const baseGrade = getMasterGradeCssFilter();
      let segFilter = '';
      if (fx === 'punch_zoom') {
        programVideo.style.transform = 'scale(1.12)';
        segFilter = 'contrast(1.06) saturate(1.08)';
      } else if (fx === 'zoom_shake') {
        const dx = Math.sin(relSec * 38) * 6;
        const dy = Math.cos(relSec * 44) * 6;
        programVideo.style.transform = `scale(1.15) translate(${dx}px, ${dy}px)`;
        segFilter = 'contrast(1.1) saturate(1.12)';
      } else if (fx === 'flash_in') {
        const b = relSec < 0.14 ? 2.2 - (relSec / 0.14) * 1.2 : 1.0;
        programVideo.style.transform = 'scale(1.05)';
        segFilter = `brightness(${b.toFixed(2)})`;
      } else if (fx === 'whip_pan') {
        const shift = relSec < 0.18 ? (1 - relSec / 0.18) * 55 : 0;
        programVideo.style.transform = `scale(1.16) translateX(${shift.toFixed(1)}px)`;
        segFilter = 'contrast(1.08) saturate(1.1)';
      } else if (fx === 'rgb_glitch') {
        programVideo.style.transform = 'scale(1.04)';
        segFilter = 'contrast(1.18) saturate(1.35) hue-rotate(12deg)';
      } else if (fx === 'film_burn') {
        programVideo.style.transform = 'scale(1.03)';
        segFilter = 'sepia(0.32) saturate(1.45) contrast(1.1)';
      } else if (fx === 'bw_contrast') {
        programVideo.style.transform = 'scale(1.0)';
        segFilter = 'grayscale(1) contrast(1.38)';
      } else {
        programVideo.style.transform = 'scale(1.0)';
      }
      const combined = [baseGrade, segFilter].filter(Boolean).join(' ');
      programVideo.style.filter = combined || 'none';
    }

    let pendingAiTransSegIdx = -1;
    async function openAiTransitionModal() {
      if (!project || !project.segments || project.segments.length < 2) {
        alert('Need at least 2 cuts on the timeline to create an AI transition between them.');
        return;
      }
      let idx = project.segments.findIndex(s => s.id === selectedSegId);
      if (idx === -1) {
        idx = project.segments.findIndex(s => playheadSec >= s.song_start && playheadSec <= s.song_end);
      }
      if (idx === -1) idx = 0;
      if (idx >= project.segments.length - 1) {
        idx = project.segments.length - 2;
      }
      pendingAiTransSegIdx = idx;

      const segA = project.segments[idx];
      const segB = project.segments[idx + 1];
      document.getElementById('aiTransPreviewBox').style.display = 'none';
      document.getElementById('aiTransBoundaryInfo').textContent =
        `⏳ Extracting boundary frames between Cut #${idx + 1} (${segA.clip_filename}) and Cut #${idx + 2} (${segB.clip_filename}) @ ${segA.song_end.toFixed(2)}s...`;
      document.getElementById('aiTransitionModal').style.display = 'flex';

      const durVal = parseFloat(document.getElementById('aiTransDurationSelect').value) || 0.55;
      try {
        const res = await fetch('/api/preview_transition_frames', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seg_index: idx, duration_sec: durVal }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Frame extraction failed');
        document.getElementById('frameALabel').textContent =
          `Cut #${idx + 1} End Frame (${segA.clip_filename} @ ${data.clip_a_time.toFixed(2)}s)`;
        document.getElementById('frameBLabel').textContent =
          `Cut #${idx + 2} Start Frame (${segB.clip_filename} @ ${data.clip_b_time.toFixed(2)}s)`;
        document.getElementById('frameAPreviewImg').src = data.frame_a_url + '?t=' + Date.now();
        document.getElementById('frameBPreviewImg').src = data.frame_b_url + '?t=' + Date.now();
        document.getElementById('downloadFrameABtn').href = data.frame_a_url;
        document.getElementById('downloadFrameBBtn').href = data.frame_b_url;
        document.getElementById('aiTransBoundaryInfo').textContent =
          `✅ Ready to bridge Cut #${idx + 1} (${segA.clip_filename}) ➜ Cut #${idx + 2} (${segB.clip_filename}) at song ${segA.song_end.toFixed(2)}s`;
      } catch (err) {
        document.getElementById('aiTransBoundaryInfo').textContent = '❌ ' + err.message;
      }
    }

    function closeAiTransitionModal() {
      document.getElementById('aiTransitionModal').style.display = 'none';
    }

    async function connectHiggsfieldMcp() {
      const btn = document.getElementById('mcpConnectBtn');
      const statusEl = document.getElementById('mcpStatusText');
      btn.disabled = true;
      btn.textContent = '⏳ Connecting to mcp.higgsfield.ai...';
      statusEl.textContent = '🌐 Complete OAuth sign-in in your browser tab if prompted...';
      try {
        const res = await fetch('/api/mcp/connect', { method: 'POST' });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'MCP connection failed');
        statusEl.innerHTML = `<span style="color:var(--green);">✅ Connected to <code>https://mcp.higgsfield.ai/mcp</code> (${data.tool_count} tools ready: ${data.tools.slice(0, 4).join(', ')})</span>`;
        btn.textContent = '✅ MCP Connected';
      } catch (err) {
        statusEl.textContent = '❌ MCP Error: ' + err.message;
        btn.textContent = '🔗 Retry MCP Connect';
      } finally {
        btn.disabled = false;
      }
    }

    async function uploadCustomTransitionMp4() {
      if (pendingAiTransSegIdx < 0) return;
      const fileInput = document.getElementById('customTransitionMp4Input');
      if (!fileInput.files || !fileInput.files.length) {
        alert('Please select the .mp4 transition file you downloaded from higgsfield.ai first.');
        return;
      }
      const btn = document.getElementById('uploadCustomTransBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Speed-Matching & Splicing .MP4...';

      const durationSec = parseFloat(document.getElementById('aiTransDurationSelect').value) || 0.85;
      const fd = new FormData();
      fd.append('seg_index', String(pendingAiTransSegIdx));
      fd.append('duration_sec', String(durationSec));
      fd.append('video', fileInput.files[0]);

      try {
        const res = await fetch('/api/upload_transition_mp4', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Upload transition failed');

        loadProjectIntoUI(data.project, true);
        if (data.new_segment) {
          selectedSegId = data.new_segment.id;
          setSelectionRange(data.new_segment.song_start, data.new_segment.song_end, true);
        }

        document.getElementById('aiTransResultLabel').textContent =
          `✨ Inserted "${data.engine_label}" (${data.new_segment.song_start.toFixed(2)}s–${data.new_segment.song_end.toFixed(2)}s):`;
        const prevVid = document.getElementById('aiTransPreviewVideo');
        prevVid.src = data.transition_url + '?t=' + Date.now();
        document.getElementById('aiTransPreviewBox').style.display = 'block';
        statusBanner.textContent = `✨ Inserted Higgsfield Web Transition at ${data.new_segment.song_start.toFixed(2)}s–${data.new_segment.song_end.toFixed(2)}s!`;
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '📥 Insert Downloaded Higgsfield .MP4';
      }
    }

    async function generateAiTransitionNow() {
      if (pendingAiTransSegIdx < 0) return;
      const btn = document.getElementById('aiTransGenerateBtn');
      btn.disabled = true;
      btn.textContent = '⏳ AI Agent Synthesizing Transition Frames...';
      toggleAgentsDrawer(true);

      const engine = document.getElementById('aiTransEngineSelect').value;
      const durationSec = parseFloat(document.getElementById('aiTransDurationSelect').value) || 0.55;
      const prompt = document.getElementById('aiTransPromptInput').value;
      const apiKey = document.getElementById('aiTransApiKeyInput').value;

      try {
        const res = await fetch('/api/create_ai_transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            seg_index: pendingAiTransSegIdx,
            engine: engine,
            duration_sec: durationSec,
            prompt: prompt,
            api_key: apiKey,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'AI transition generation failed');

        loadProjectIntoUI(data.project, true);
        if (data.new_segment) {
          selectedSegId = data.new_segment.id;
          setSelectionRange(data.new_segment.song_start, data.new_segment.song_end, true);
        }

        document.getElementById('aiTransResultLabel').textContent =
          `✨ Inserted "${data.engine_label}" (${data.new_segment.song_start.toFixed(2)}s–${data.new_segment.song_end.toFixed(2)}s):`;
        const prevVid = document.getElementById('aiTransPreviewVideo');
        prevVid.src = data.transition_url + '?t=' + Date.now();
        document.getElementById('aiTransPreviewBox').style.display = 'block';
        statusBanner.textContent = `✨ Inserted AI Transition (${data.engine_label}) at ${data.new_segment.song_start.toFixed(2)}s–${data.new_segment.song_end.toFixed(2)}s!`;
      } catch (err) {
        alert('Error: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '✨ Generate & Insert AI Transition Between Cuts';
      }
    }

    document.getElementById('songForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('songSubmitBtn');
      btn.disabled = true;
      btn.textContent = '⏳ Transcribing Lyrics & Detecting 808s...';
      statusBanner.textContent = 'Analyzing master song, transcribing lyrics, and detecting 808 hits...';

      const formData = new FormData(e.target);
      try {
        const res = await fetch('/api/upload_song', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Song load failed');
        closeSongModal();
        loadProjectIntoUI(data.project);
        statusBanner.textContent = `✅ Master Song Loaded (${data.project.lyrics_phrases.length} lyric phrases, ${data.project.bass_drop_times.length} 808 hits)!`;
      } catch (err) {
        statusBanner.textContent = '❌ Error: ' + err.message;
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🎵 Load & Transcribe Master Song';
      }
    });

    // Spawns parallel Clip Sync Agents in the background immediately!
    document.getElementById('addClipsForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('addClipsSubmitBtn');
      btn.disabled = true;
      btn.textContent = '🚀 Spawning Parallel Sync Agents...';

      const formData = new FormData(e.target);
      formData.append('cut_mode', document.getElementById('cutModeSelect').value);
      try {
        const res = await fetch('/api/add_clips', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Add clips failed');
        e.target.reset();
        closeAddClipsModal();
        toggleAgentsDrawer(true);
        statusBanner.textContent = `🤖 Spawned ${data.spawned_count} parallel Sync Agent(s)! Clips will stream onto the timeline as each agent completes.`;
        pollAgentsTelemetry();
      } catch (err) {
        statusBanner.textContent = '❌ Error: ' + err.message;
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🚀 Launch Parallel Sync Agents';
      }
    });

    async function resyncAllFromFolder() {
      const btn = document.getElementById('resyncAllBtn');
      btn.disabled = true;
      btn.textContent = '🚀 Spawning Agents...';
      const fd = new FormData();
      fd.append('cut_mode', document.getElementById('cutModeSelect').value);
      try {
        const res = await fetch('/api/sync_project', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Sync failed');
        closeAddClipsModal();
        toggleAgentsDrawer(true);
        statusBanner.textContent = `🤖 Spawned ${data.spawned_count} parallel Sync Agent(s) for all clips in input/clips/!`;
        pollAgentsTelemetry();
      } catch (err) {
        statusBanner.textContent = '❌ Error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Re-Spawn Agents for All in input/clips/';
      }
    }

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepCutSelection(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepCutSelection(1);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        loopSelectedRange();
      } else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (currentHotAngles && currentHotAngles[idx]) {
          e.preventDefault();
          const item = currentHotAngles[idx];
          swapAngleAndLoopPreview(item.clip, item.defaultClipIn);
        }
      } else if (e.key === 'i' || e.key === 'I') {
        setInAtPlayhead();
      } else if (e.key === 'o' || e.key === 'O') {
        setOutAtPlayhead();
      } else if (e.key === 's' || e.key === 'S') {
        splitSegmentAtPlayhead();
      }
    });

    window.addEventListener('DOMContentLoaded', async () => {
      const res = await fetch('/api/project');
      const data = await res.json();
      if (data.project) {
        loadProjectIntoUI(data.project);
      }
    });
  </script>
</body>
</html>
"""


@app.route("/")
def index():
    resp = app.make_response(render_template_string(HTML_TEMPLATE))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return resp


@app.route("/song_media/<path:filename>")
def serve_song(filename):
    return send_from_directory(str(SONG_DIR), filename)


@app.route("/proxies/<path:filename>")
def serve_proxy(filename):
    return send_from_directory(str(PROXY_DIR), filename)


@app.route("/output/<path:filename>")
def serve_output(filename):
    return send_from_directory(str(OUT_DIR), filename)


@app.route("/api/project", methods=["GET"])
def api_get_project():
    proj = load_project_state()
    if proj is not None:
        exports = sorted(
            [p for p in OUT_DIR.glob("triller_horizontal_*.mp4") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if exports and not proj.get("latest_export_url"):
            proj["latest_export_url"] = f"/output/{exports[0].name}"
    return jsonify({"project": proj})


@app.route("/api/agents_status", methods=["GET"])
def api_agents_status():
    """Return live status of all active & recent worker agents + current project version."""
    now = time.time()
    with AGENTS_LOCK:
        # Keep running agents and agents completed within the last 90 seconds
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


@app.route("/api/upload_song", methods=["POST"])
def api_upload_song():
    try:
        ensure_ffmpeg()
        song_file = request.files.get("song")
        if song_file and song_file.filename:
            sname = secure_filename(song_file.filename)
            song_path = str(SONG_DIR / sname)
            song_file.save(song_path)
        else:
            existing_songs = [
                str(p) for p in sorted(SONG_DIR.iterdir())
                if p.is_file() and not p.name.startswith(".")
            ]
            if not existing_songs:
                return jsonify({"error": "No song file selected and input/song/ is empty."}), 400
            song_path = existing_songs[0]

        song_url = f"/song_media/{os.path.basename(song_path)}"
        state = init_song_only_project(song_path=song_path, song_url=song_url)
        state_dict = dataclasses.asdict(state)
        save_project_state(state_dict)
        # Warm up cached song bundle in RAM
        get_cached_song_bundle(song_path, state_dict)
        return jsonify({"project": state_dict})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/sync_project", methods=["POST"])
def api_sync_project():
    """Spawn parallel background Clip Sync Agents for all clips in `input/clips/`."""
    try:
        ensure_ffmpeg()
        proj = load_project_state()

        if proj and proj.get("song_filepath") and os.path.exists(proj["song_filepath"]):
            song_path = proj["song_filepath"]
        else:
            existing_songs = [
                str(p) for p in sorted(SONG_DIR.iterdir())
                if p.is_file() and not p.name.startswith(".")
            ]
            if not existing_songs:
                return jsonify({"error": "Please upload the Master Song first (Step 1)."}), 400
            song_path = existing_songs[0]
            song_url = f"/song_media/{os.path.basename(song_path)}"
            proj = dataclasses.asdict(init_song_only_project(song_path, song_url))
            save_project_state(proj)

        clip_paths = [
            str(p) for p in sorted(CLIPS_DIR.iterdir())
            if p.is_file() and not p.name.startswith(".")
        ]
        if not clip_paths:
            return jsonify({"error": "No video clips found in input/clips/."}), 400

        cut_mode = request.form.get("cut_mode", "lyrics_808")
        # Warm up cached master song bundle once before spawning agents
        get_cached_song_bundle(song_path, proj)

        agent_ids = []
        for idx, cpath in enumerate(clip_paths, 1):
            cname = os.path.basename(cpath)
            aid = spawn_clip_sync_agent(cpath, cname, song_path, cut_mode, idx)
            agent_ids.append(aid)

        return jsonify({
            "ok": True,
            "spawned_count": len(agent_ids),
            "agent_ids": agent_ids,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/add_clips", methods=["POST"])
def api_add_clips():
    """
    Save uploaded files and immediately spawn a parallel background Sync Agent
    per uploaded video clip so the browser never blocks!
    """
    try:
        ensure_ffmpeg()
        proj = load_project_state()
        if not proj or not proj.get("song_filepath") or not os.path.exists(proj["song_filepath"]):
            return jsonify({"error": "Please upload the Master Song first (Step 1)."}), 400

        uploaded_clips = [f for f in request.files.getlist("clips") if f and f.filename]
        if not uploaded_clips:
            return jsonify({"error": "No video files selected to upload."}), 400

        song_path = proj["song_filepath"]
        cut_mode = request.form.get("cut_mode") or proj.get("cut_mode", "lyrics_808")

        # Warm up cached master song bundle in RAM so all spawned agents start at t=0.0s
        get_cached_song_bundle(song_path, proj)

        agent_ids = []
        base_idx = len(proj.get("clips", []))
        for offset_i, f in enumerate(uploaded_clips, 1):
            cname = secure_filename(f.filename)
            cpath = str(CLIPS_DIR / cname)
            f.save(cpath)
            aid = spawn_clip_sync_agent(cpath, cname, song_path, cut_mode, base_idx + offset_i)
            agent_ids.append(aid)

        return jsonify({
            "ok": True,
            "spawned_count": len(agent_ids),
            "agent_ids": agent_ids,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/delete_clip", methods=["POST"])
def api_delete_clip():
    try:
        proj = load_project_state()
        if not proj:
            return jsonify({"error": "No project loaded"}), 400

        body = request.get_json(force=True) or {}
        clip_id = body.get("clip_id")
        if not clip_id:
            return jsonify({"error": "Missing clip_id"}), 400

        all_clips = [dict_to_clip(c) for c in proj.get("clips", [])]
        target = next((c for c in all_clips if c.clip_id == clip_id), None)
        if not target:
            return jsonify({"error": f"Clip {clip_id} not found"}), 404

        try:
            if os.path.exists(target.filepath):
                os.remove(target.filepath)
        except Exception:
            pass

        remaining_clips = [c for c in all_clips if c.clip_id != clip_id]
        for i, c in enumerate(remaining_clips):
            c.color = CLIP_PALETTE[i % len(CLIP_PALETTE)]

        updated_segments: list[EditSegment] = []
        last_cid: str | None = None
        for s_dict in proj.get("segments", []):
            seg = dict_to_segment(s_dict)
            if seg.clip_id == clip_id:
                pick = pick_best_clip_for_window(
                    seg.song_start, seg.song_end, remaining_clips, last_clip_id=last_cid, randomize=True
                )
                if pick is not None:
                    chosen, c_in, c_out, is_synced = pick
                    seg.clip_id = chosen.clip_id
                    seg.clip_filename = chosen.filename
                    seg.clip_filepath = chosen.filepath
                    seg.proxy_url = chosen.proxy_url
                    seg.clip_in = c_in
                    seg.clip_out = c_out
                    seg.is_synced = is_synced
                    updated_segments.append(seg)
                    last_cid = chosen.clip_id
            else:
                updated_segments.append(seg)
                last_cid = seg.clip_id

        for idx, seg in enumerate(updated_segments):
            seg.index = idx

        proj["clips"] = [dataclasses.asdict(c) for c in remaining_clips]
        proj["segments"] = [dataclasses.asdict(s) for s in updated_segments]
        save_project_state(proj)
        return jsonify({"project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/reslice", methods=["POST"])
def api_reslice():
    try:
        proj = load_project_state()
        if not proj:
            return jsonify({"error": "No project loaded"}), 400

        body = request.get_json(silent=True) or {}
        cut_mode = body.get("cut_mode") or proj.get("cut_mode", "lyrics_808")
        preserve_timing = body.get("preserve_timing", cut_mode == proj.get("cut_mode"))

        clips = [dict_to_clip(c) for c in proj.get("clips", [])]
        existing_segments = [dict_to_segment(s) for s in proj.get("segments", [])]
        song_dur = float(proj.get("song_duration", 0.0))
        covers_full_song = (
            bool(existing_segments)
            and existing_segments[0].song_start <= 0.6
            and existing_segments[-1].song_end >= song_dur - 1.0
        )

        if preserve_timing and covers_full_song and cut_mode == proj.get("cut_mode", "lyrics_808"):
            # Maintain exact timing of existing cuts, picking a random other synced clip
            # that lines up at each timestamp!
            segments = recut_segments_preserving_timing(existing_segments, clips)
            proj["segments"] = [dataclasses.asdict(s) for s in segments]
        else:
            song_info, _ = get_cached_song_bundle(proj["song_filepath"], proj)
            phrases = [LyricPhrase(**p) for p in proj.get("lyrics_phrases", [])]
            segments, r_start, r_end = build_segments_by_mode(
                song_info,
                clips,
                cut_mode=cut_mode,
                lyrics_phrases=phrases,
                previous_segments=existing_segments,
            )
            proj["segments"] = [dataclasses.asdict(s) for s in segments]
            proj["render_start_sec"] = r_start
            proj["render_end_sec"] = r_end
            proj["bass_drop_times"] = song_info["bass_drop_times"]
            proj["cut_mode"] = cut_mode

        save_project_state(proj)
        return jsonify({"project": proj})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update_segments", methods=["POST"])
def api_update_segments():
    proj = load_project_state()
    if not proj:
        return jsonify({"error": "No project loaded"}), 400
    body = request.get_json(force=True) or {}
    if "segments" in body:
        proj["segments"] = body["segments"]
        save_project_state(proj)
    return jsonify({"ok": True, "version": PROJECT_VERSION})


@app.route("/api/preview_transition_frames", methods=["POST"])
def api_preview_transition_frames():
    """
    Extracts the exact last frame of Cut `seg_index` (at `clip_out - D/2`) and
    the exact first frame of Cut `seg_index + 1` (at `clip_in + D/2`) so the user
    can preview the two boundary images before generating an AI transition.
    """
    try:
        proj = load_project_state()
        if not proj or not proj.get("segments"):
            return jsonify({"error": "No timeline segments loaded"}), 400

        body = request.get_json(force=True) or {}
        seg_idx = int(body.get("seg_index", 0))
        dur_sec = float(body.get("duration_sec", 0.55))
        half_d = dur_sec * 0.5

        segs = proj["segments"]
        if seg_idx < 0 or seg_idx >= len(segs) - 1:
            return jsonify({"error": "Select a cut that has a following cut on the timeline."}), 400

        seg_a = dict_to_segment(segs[seg_idx])
        seg_b = dict_to_segment(segs[seg_idx + 1])

        clip_a_t = max(0.0, seg_a.clip_out - half_d)
        clip_b_t = max(0.0, seg_b.clip_in + half_d)

        frame_a_name = f"trans_preview_{seg_idx}_A.png"
        frame_b_name = f"trans_preview_{seg_idx}_B.png"
        frame_a_path = str(PROXY_DIR / frame_a_name)
        frame_b_path = str(PROXY_DIR / frame_b_name)

        extract_frame_at_timestamp(seg_a.clip_filepath, clip_a_t, frame_a_path)
        extract_frame_at_timestamp(seg_b.clip_filepath, clip_b_t, frame_b_path)

        return jsonify({
            "frame_a_url": f"/proxies/{frame_a_name}",
            "frame_b_url": f"/proxies/{frame_b_name}",
            "clip_a_time": round(clip_a_t, 3),
            "clip_b_time": round(clip_b_t, 3),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/create_ai_transition", methods=["POST"])
def api_create_ai_transition():
    """
    Spawns an AI Transition Agent to bridge the last frame of Cut `seg_index`
    and the first frame of Cut `seg_index + 1`, trims D/2 from Cut A's end and
    D/2 from Cut B's start so song lyric sync stays 100% locked, and inserts the
    new AI Transition segment between them!
    """
    try:
        proj = load_project_state()
        if not proj or not proj.get("segments"):
            return jsonify({"error": "No timeline segments loaded"}), 400

        body = request.get_json(force=True) or {}
        seg_idx = int(body.get("seg_index", 0))
        engine = body.get("engine", "optical_morph")
        dur_sec = float(body.get("duration_sec", 0.55))
        prompt = body.get("prompt", "")
        api_key = (body.get("api_key") or "").strip()
        if api_key:
            os.environ["HF_KEY"] = api_key

        segs = [dict_to_segment(s) for s in proj["segments"]]
        if seg_idx < 0 or seg_idx >= len(segs) - 1:
            return jsonify({"error": "Invalid cut index for transition."}), 400

        seg_a = segs[seg_idx]
        seg_b = segs[seg_idx + 1]
        cut_t = seg_a.song_end

        # Clamp transition duration so neither adjacent segment shrinks below 0.25s
        max_allowable = min(
            dur_sec,
            max(0.20, (seg_a.song_end - seg_a.song_start) - 0.25),
            max(0.20, (seg_b.song_end - seg_b.song_start) - 0.25),
        )
        half_d = round(max_allowable * 0.5, 3)
        t_trans_start = round(cut_t - half_d, 3)
        t_trans_end = round(cut_t + half_d, 3)
        actual_dur = round(t_trans_end - t_trans_start, 3)
        trim_a = round(cut_t - t_trans_start, 3)
        trim_b = round(t_trans_end - cut_t, 3)

        clip_a_t = round(max(0.0, seg_a.clip_out - trim_a), 3)
        clip_b_t = round(max(0.0, seg_b.clip_in + trim_b), 3)

        agent_id = f"ai_trans_{int(time.time() * 1000)}"
        agent_title = f"AI Transition Agent ({seg_a.clip_filename} ➜ {seg_b.clip_filename})"

        def _cb(stage_msg: str, pct_val: int):
            update_agent_status(
                agent_id,
                agent_title,
                f"Engine: {engine}",
                stage_msg,
                pct_val,
                "done" if pct_val >= 100 else "running",
            )

        _cb("📸 Extracting Last Frame of Cut A & First Frame of Cut B...", 10)
        ts_tag = int(time.time() * 1000)
        frame_a_path = str(PROXY_DIR / f"ai_frame_{ts_tag}_A.png")
        frame_b_path = str(PROXY_DIR / f"ai_frame_{ts_tag}_B.png")
        out_mp4_name = f"ai_transition_{ts_tag}.mp4"
        out_mp4_path = str(PROXY_DIR / out_mp4_name)

        extract_frame_at_timestamp(seg_a.clip_filepath, clip_a_t, frame_a_path)
        extract_frame_at_timestamp(seg_b.clip_filepath, clip_b_t, frame_b_path)

        _, engine_label = generate_ai_transition_between_frames(
            frame_a_path=frame_a_path,
            frame_b_path=frame_b_path,
            output_mp4=out_mp4_path,
            duration_sec=actual_dur,
            fps=30,
            engine=engine,
            prompt=prompt,
            api_key=api_key,
            progress_cb=_cb,
        )

        # Trim Cut A's tail by trim_a and Cut B's head by trim_b so song lyric sync never shifts!
        seg_a.song_end = t_trans_start
        seg_a.clip_out = clip_a_t

        seg_b.song_start = t_trans_end
        seg_b.clip_in = clip_b_t

        trans_seg = EditSegment(
            id=f"seg_aitrans_{ts_tag}",
            index=seg_idx + 1,
            song_start=t_trans_start,
            song_end=t_trans_end,
            clip_id=seg_a.clip_id,
            clip_filename=f"✨ AI_TRANS ({seg_a.clip_filename[:8]}➜{seg_b.clip_filename[:8]})",
            clip_filepath=out_mp4_path,
            proxy_url=f"/proxies/{out_mp4_name}",
            clip_in=0.0,
            clip_out=actual_dur,
            is_synced=True,
            effect="none",
            beat_energy=0.95,
            cut_reason="ai_transition",
        )

        segs.insert(seg_idx + 1, trans_seg)
        for i, s in enumerate(segs):
            s.index = i

        proj["segments"] = [dataclasses.asdict(s) for s in segs]
        save_project_state(proj)

        return jsonify({
            "project": proj,
            "new_segment": dataclasses.asdict(trans_seg),
            "transition_url": f"/proxies/{out_mp4_name}",
            "engine_label": engine_label,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload_transition_mp4", methods=["POST"])
def api_upload_transition_mp4():
    """
    Allows the user to upload a transition .mp4 generated with their regular
    Higgsfield.ai web subscription ($0 API cost), speed-fits it to `actual_dur`,
    and splices it between Cut A and Cut B without shifting song lyric sync!
    """
    try:
        proj = load_project_state()
        if not proj or not proj.get("segments"):
            return jsonify({"error": "No timeline segments loaded"}), 400

        vid_file = request.files.get("video")
        if not vid_file or not vid_file.filename:
            return jsonify({"error": "No transition video file selected"}), 400

        seg_idx = int(request.form.get("seg_index", 0))
        dur_sec = float(request.form.get("duration_sec", 0.85))

        segs = [dict_to_segment(s) for s in proj["segments"]]
        if seg_idx < 0 or seg_idx >= len(segs) - 1:
            return jsonify({"error": "Invalid cut index for transition."}), 400

        seg_a = segs[seg_idx]
        seg_b = segs[seg_idx + 1]
        cut_t = seg_a.song_end

        max_allowable = min(
            dur_sec,
            max(0.20, (seg_a.song_end - seg_a.song_start) - 0.25),
            max(0.20, (seg_b.song_end - seg_b.song_start) - 0.25),
        )
        half_d = round(max_allowable * 0.5, 3)
        actual_dur = round(half_d * 2.0, 3)

        clip_a_t = max(0.0, seg_a.clip_out - half_d)
        clip_b_t = max(0.0, seg_b.clip_in + half_d)

        ts_tag = int(time.time() * 1000)
        raw_path = str(PROXY_DIR / f"raw_web_trans_{ts_tag}.mp4")
        vid_file.save(raw_path)

        out_mp4_name = f"ai_transition_web_{ts_tag}.mp4"
        out_mp4_path = str(PROXY_DIR / out_mp4_name)

        try:
            pr = subprocess.run(
                [
                    "ffprobe", "-v", "error", "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1", raw_path,
                ],
                capture_output=True, text=True, check=True,
            )
            src_dur = max(0.2, float(pr.stdout.strip()))
        except Exception:
            src_dur = 5.0
        pts_factor = actual_dur / src_dur
        vf = (
            f"setpts={pts_factor:.5f}*PTS,"
            "scale=1920:1080:force_original_aspect_ratio=increase,"
            "crop=1920:1080,fps=30,format=yuv420p"
        )
        subprocess.run(
            [
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                "-i", raw_path,
                "-vf", vf,
                "-t", f"{actual_dur:.3f}",
                "-an",
                "-c:v", "h264_videotoolbox", "-b:v", "8M",
                out_mp4_path,
            ],
            check=True,
        )

        t_trans_start = round(cut_t - half_d, 3)
        t_trans_end = round(cut_t + half_d, 3)

        seg_a.song_end = t_trans_start
        seg_a.clip_out = round(clip_a_t, 3)

        seg_b.song_start = t_trans_end
        seg_b.clip_in = round(clip_b_t, 3)

        trans_seg = EditSegment(
            id=f"seg_aitrans_{ts_tag}",
            index=seg_idx + 1,
            song_start=t_trans_start,
            song_end=t_trans_end,
            clip_id=seg_a.clip_id,
            clip_filename=f"✨ HF_WEB ({seg_a.clip_filename[:8]}➜{seg_b.clip_filename[:8]})",
            clip_filepath=out_mp4_path,
            proxy_url=f"/proxies/{out_mp4_name}",
            clip_in=0.0,
            clip_out=actual_dur,
            is_synced=True,
            effect="none",
            beat_energy=0.95,
            cut_reason="ai_transition",
        )

        segs.insert(seg_idx + 1, trans_seg)
        for i, s in enumerate(segs):
            s.index = i

        proj["segments"] = [dataclasses.asdict(s) for s in segs]
        save_project_state(proj)

        return jsonify({
            "project": proj,
            "new_segment": dataclasses.asdict(trans_seg),
            "transition_url": f"/proxies/{out_mp4_name}",
            "engine_label": "Higgsfield Web Subscription (.MP4 Import)",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/mcp/connect", methods=["POST"])
def api_mcp_connect():
    try:
        from higgsfield_mcp_client import HiggsfieldMCPClient

        mcp = HiggsfieldMCPClient()
        mcp.initialize()
        tools = mcp.list_tools()
        tool_names = [t.get("name", "unknown") for t in tools]
        return jsonify({
            "connected": True,
            "endpoint": "https://mcp.higgsfield.ai/mcp",
            "tool_count": len(tool_names),
            "tools": tool_names,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/export", methods=["POST"])
def api_export():
    try:
        proj = load_project_state()
        if not proj or not proj.get("segments"):
            return jsonify({"error": "No segments on timeline to export."}), 400

        body = request.get_json(silent=True) or {}
        color_grade = body.get("color_grade", "none")
        quality_mode = body.get("quality_mode", "cas_crisp")

        segments = [dict_to_segment(s) for s in proj["segments"]]
        out_name = f"triller_horizontal_{int(time.time())}.mp4"
        out_path = str(OUT_DIR / out_name)

        export_agent_id = f"export_{int(time.time() * 1000)}"
        agent_sub = f"6x VideoToolbox 1080p Agents • Grade: {color_grade} • Enhance: {quality_mode}"
        update_agent_status(
            export_agent_id,
            f"Export Swarm ({len(segments)} cuts)",
            agent_sub,
            "🚀 Starting parallel color-graded & CAS-sharpened segment renders...",
            5,
            "running",
        )

        def _exp_cb(stage_msg: str, pct_val: int):
            update_agent_status(
                export_agent_id,
                f"Export Swarm ({len(segments)} cuts)",
                agent_sub,
                stage_msg,
                pct_val,
                "done" if pct_val >= 100 else "running",
            )

        render_triller_video(
            song_path=proj["song_filepath"],
            segments=segments,
            render_start=segments[0].song_start,
            render_end=segments[-1].song_end,
            output_path=out_path,
            target_w=1920,
            target_h=1080,
            progress_cb=_exp_cb,
            color_grade=color_grade,
            quality_mode=quality_mode,
        )
        proj["latest_export_url"] = f"/output/{out_name}"
        save_project_state(proj)
        return jsonify({
            "video_url": f"/output/{out_name}",
            "output_path": out_path,
            "color_grade": color_grade,
            "quality_mode": quality_mode,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("🎬 Clipper Studio v6 (Parallel Agent Swarm) running on http://127.0.0.1:5050")
    app.run(host="127.0.0.1", port=5050, debug=False, threaded=True)
