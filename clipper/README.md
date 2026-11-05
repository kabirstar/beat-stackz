# Clipper Studio — Multi-Angle AI Music Video Sync & Morph NLE (`:5050`)

**Clipper Studio** is a local-first, hardware-accelerated multi-camera music video editor and auto-director built with Flask, Librosa, Audalign, Faster-Whisper, MediaPipe FaceMesh, OpenCV, FFmpeg (`h264_videotoolbox` + AMD FidelityFX `cas`), and Higgsfield Kling 3.0 Pro (`kling-video/v3.0/pro/image-to-video`) Start-to-End Frame AI Morphing.

---

## 1. Quickstart (For Humans & AI Agents)

```bash
cd clipper
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Copy .env.example to .env.local and add your HF_KEY (optional, only needed for cloud Kling 3.0 morphs)
cp .env.example .env.local

# Place master audio in input/song/ and camera takes in input/clips/
mkdir -p input/song input/clips output/proxies

# Launch Clipper Studio on http://127.0.0.1:5050
./.venv/bin/python app.py
```

---

## 2. Folder & File Architecture

```text
clipper/
├── app.py                     # Flask server (:5050), REST API, and responsive Web NLE UI
├── clipper_engine.py          # Core DSP sync, Whisper lyrics, auto-director, FFmpeg render swarm, AI transitions
├── higgsfield_mcp_client.py   # OAuth 2.1 + PKCE client for https://mcp.higgsfield.ai/mcp
├── cli.py                     # Headless CLI runner for automated multi-cam sync & render
├── main.py                    # Standalone Higgsfield Kling / DoP test harness
├── requirements.txt           # Pinned Python dependencies
├── .env.example               # Template for HF_KEY / FAL_KEY (never commit .env.local)
├── DOCS_AND_LESSONS.md        # Engineering lessons learned, feature matrix & roadmap
├── AI_HANDOFF_GUIDE.md        # Complete technical specification for another AI to recreate or extend
├── input/
│   ├── song/                  # Master audio track (.wav / .mp3 / .m4a)
│   └── clips/                 # Raw multi-camera performance & B-roll video takes (.mov / .mp4)
└── output/
    ├── current_project.json   # Live serialized ProjectState (clips, sync offsets, 80-cut timeline)
    ├── proxies/               # 720p browser proxies & generated AI morph transition .mp4 clips
    └── triller_horizontal_*.mp4 # Exported 1080p 30fps master music videos
```

---

## 3. Core Capabilities

1. **Multi-Stage Audio-Visual Lip-Sync Alignment (`sync_clip_to_song`)**:
   - Stage 1: `audalign` spectral fingerprint correlation (`CorrelationRecognizer` + `CorrelationSpectrogramRecognizer`).
   - Stage 2: Multi-band vocal envelope cross-correlation (`300–3400 Hz`) at `200 Hz` (`±5 ms` precision).
   - Stage 3: `faster-whisper` lyric word-timestamp matching.
   - Stage 4: MediaPipe FaceMesh mouth-aperture (`MAR`) lip-movement correlation (`verify_visual_lipsync`).
2. **Beat, 808 Sub-Bass & Fast-Rap Cadence Auto-Director (`build_segments_by_mode`)**:
   - Detects BPM, 808 sub-bass drops (`20–95 Hz`), and high-density vocal syllable bursts.
   - Prevents any single camera angle from monopolizing the timeline via energy-weighted round-robin selection across all aligned takes.
3. **Zero-Drift Start➜End Frame AI Morph Transitions (`generate_ai_transition_between_frames`)**:
   - Extracts the exact outgoing frame of `Cut A` (`seg_a.clip_out - D/2`) and incoming frame of `Cut B` (`seg_b.clip_in + D/2`).
   - Supports **Higgsfield Kling 3.0 Pro** (`kling-video/v3.0/pro/image-to-video`), **Higgsfield Wan 3.0**, **Higgsfield Seedance 2.5**, **Higgsfield MCP**, and local **Farnebäck Dense Optical Flow / Datamosh**.
   - Carves `D/2` from `seg_a` and `D/2` from `seg_b` while advancing `seg_b.clip_in` by `D/2` so lip-sync (`song_start - clip_in == song_offset_sec`) never shifts by even 1 millisecond.
4. **Parallel Hardware Render Swarm + AMD FidelityFX CAS (`render_triller_video`)**:
   - Spawns 6 concurrent `h264_videotoolbox` worker threads using telescoping integer frame boundaries (`f_start`, `f_end`) so `0.000s` of cumulative frame rounding drift occurs across 80+ cuts.
   - Applies 3D temporal low-light denoising (`hqdn3d`) + AMD FidelityFX Contrast-Adaptive Sharpening (`cas`) + optional cinema color grades (`none` by default, `kodak_2383`, `night_trap`, `bleach_bypass`, `warm_vintage`).
5. **Zero-Flash Responsive Web Studio (`http://127.0.0.1:5050`)**:
   - Plays the continuous stitched master MP4 (`latest_export_url`) in the main monitor for zero-flash playback, caches all camera angle `<video>` cards in `angleCardCache` so thumbnails never flash, and displays a clickable **✨ AI Morph Transitions in Timeline** navigator bar.
