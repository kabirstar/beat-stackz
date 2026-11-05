#!/usr/bin/env python3
"""
Clipper CLI — Run Triller-style auto-sync and beat-chopped video generation from the terminal
or from the drop folders (`input/song/` and `input/clips/`).
"""

from __future__ import annotations

import argparse
import dataclasses
import glob
import json
import os
import sys
import time
from pathlib import Path

from clipper_engine import run_clipper_pipeline, ensure_ffmpeg

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_SONG_DIR = BASE_DIR / "input" / "song"
DEFAULT_CLIPS_DIR = BASE_DIR / "input" / "clips"
DEFAULT_OUT_DIR = BASE_DIR / "output"

AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".flac", ".aac", ".ogg"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".mkv"}


def find_media_files(directory: Path, exts: set) -> list[str]:
    if not directory.exists():
        return []
    files = [
        str(p)
        for p in sorted(directory.iterdir())
        if p.is_file() and not p.name.startswith(".") and p.suffix.lower() in exts
    ]
    return files


def main():
    parser = argparse.ArgumentParser(
        description="Clipper: Triller-style Audio-Synced & Beat-Chopped Video Generator"
    )
    parser.add_argument(
        "--song",
        type=str,
        default=None,
        help="Path to master song (.wav/.mp3). Defaults to first audio file in input/song/",
    )
    parser.add_argument(
        "--clips",
        type=str,
        nargs="*",
        default=None,
        help="Paths to video clips or folder of clips. Defaults to input/clips/",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=str(DEFAULT_OUT_DIR / "triller_edit.mp4"),
        help="Output .mp4 path (default: output/triller_edit.mp4)",
    )
    parser.add_argument(
        "--pace",
        choices=["chill", "triller", "hyper"],
        default="triller",
        help="Cutting pace: chill (2-4 bars), triller (1-2 beats + drop chops), hyper (rapid beat/half-beat cuts)",
    )
    parser.add_argument(
        "--start",
        type=float,
        default=None,
        help="Optional start timestamp in the song (seconds). Auto-detected from synced takes by default.",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=None,
        help="Optional duration to render (seconds). Auto-detected from synced takes by default.",
    )

    args = parser.parse_args()

    # Resolve song
    song_path = args.song
    if not song_path:
        candidates = find_media_files(DEFAULT_SONG_DIR, AUDIO_EXTS)
        if not candidates:
            print(f"[!] No song found in {DEFAULT_SONG_DIR}. Drop a .wav file there or pass --song <path>.")
            sys.exit(1)
        song_path = candidates[0]

    if not os.path.exists(song_path):
        print(f"[!] Song file not found: {song_path}")
        sys.exit(1)

    # Resolve clips
    clip_paths: list[str] = []
    if args.clips:
        for item in args.clips:
            p = Path(item)
            if p.is_dir():
                clip_paths.extend(find_media_files(p, VIDEO_EXTS))
            elif p.is_file():
                clip_paths.append(str(p))
    else:
        clip_paths = find_media_files(DEFAULT_CLIPS_DIR, VIDEO_EXTS)

    if not clip_paths:
        print(f"[!] No video clips found in {DEFAULT_CLIPS_DIR}. Drop .mp4/.mov clips there or pass --clips.")
        sys.exit(1)

    print("====================================================")
    print(" 🎬 CLIPPER — Triller Auto-Sync & Beat-Chop Engine")
    print("====================================================")
    print(f" • Master Song : {song_path}")
    print(f" • Video Takes : {len(clip_paths)} clip(s)")
    for idx, cp in enumerate(clip_paths, 1):
        print(f"    [{idx}] {os.path.basename(cp)}")
    print(f" • Edit Pace   : {args.pace.upper()}")
    print("----------------------------------------------------")
    print("[1/3] Ensuring FFmpeg & analyzing audio/video...")

    t0 = time.time()
    ensure_ffmpeg()

    plan = run_clipper_pipeline(
        song_path=song_path,
        clip_paths=clip_paths,
        output_path=args.output,
        pace=args.pace,
        start_override=args.start,
        duration_override=args.duration,
    )
    elapsed = time.time() - t0

    print(f"\n[2/3] Audio Cross-Correlation Sync Results (BPM: {plan.bpm}):")
    for c in plan.clips:
        mode_tag = "SYNCED TAKE" if c.is_synced_take else "B-ROLL / CUTAWAY"
        print(
            f"  • {c.filename:<24} -> Song Offset: {c.song_offset_sec:>6.2f}s | "
            f"Confidence: {c.sync_confidence:>5.1f} | {mode_tag} | Energy: {c.mean_energy:.2f}"
        )

    print(
        f"\n[3/3] Rendered {len(plan.segments)} beat-synced cuts "
        f"({plan.render_start_sec:.2f}s -> {plan.render_end_sec:.2f}s of song) in {elapsed:.1f}s!"
    )
    print(f" ✅ Output Video : {args.output}")

    plan_json_path = str(Path(args.output).with_suffix(".json"))
    with open(plan_json_path, "w", encoding="utf-8") as f:
        json.dump(dataclasses.asdict(plan), f, indent=2)
    print(f" 📄 Edit Timeline: {plan_json_path}")


if __name__ == "__main__":
    main()
