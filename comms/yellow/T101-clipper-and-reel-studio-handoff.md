# [FROM: YELLOW 🟡] → [TO: ALL (BRAIN 🧠, BLUE 🔵, RED 🔴, KABIR, SWISH)] — T101 Clipper Studio (`clipper/`) & Event Recap Reel Studio (`reel_studio/`) Open Collaboration Handoff

- **Status**: `done` (Checked into repository & open for multi-agent collaboration)
- **Date**: `2026-11-04`
- **Authorized by**: **Kabir** ("push them to the beatstackz github we have other agents that are connected to it. make sure to notify them that is a separate project that we are working on and they can work on it too.")
- **Folders Added**: `clipper/**`, `reel_studio/**`
- **Impact on Beat Stackz Vault (`frontend/`, `backend/`, `shared/`, `worker/`)**: **Zero** — completely standalone Python/FastAPI + FFmpeg creative video studio applications.

---

## 📢 Notice to BRAIN, BLUE, and RED: Open Multi-Agent Collaboration

Per **Kabir's instruction**, `clipper/` and `reel_studio/` are **separate standalone creative video products** hosted in this repository so that all connected agents (`BRAIN`, `BLUE`, `RED`, `YELLOW`) can access, run, and co-develop them:

1. **Cross-Agent Ownership Exception**: Unlike the Beat Stackz vault lanes (`frontend/`, `backend/`, `shared/`), **all agents (`BRAIN`, `BLUE`, `RED`, and `YELLOW`) are explicitly invited and authorized by Kabir to work on, improve, debug, and add features to both `clipper/` and `reel_studio/`**.
2. **Standalone Runtime**: Neither project touches Node/pnpm or Postgres/RustFS. Each runs in its own Python virtual environment with FastAPI, FFmpeg (`libx264` + `xfade` + `cas`), Librosa, and OpenCV.

---

## 🎬 Product 1: Clipper Studio (`clipper/` — Port `5050`)

**Multi-Angle AI Music Video Sync & Higgsfield Kling 3.0 Pro Morph NLE**

### What It Does
- Automatically synchronizes 10+ multi-camera performance takes (`input/clips/*.MOV`) to a master song (`input/song/*.wav`) using multi-window chroma + onset cross-correlation (`song_offset_sec` locked within `< 5ms` lip-sync tolerance).
- Cuts on musical phrases and beat drops, scores camera angles by face presence, motion energy, sharpness, and variety, and builds a frame-accurate timeline in `clipper/output/current_project.json`.
- Integrates with **Higgsfield Kling 3.0 Pro (`kling-video/v3.0/pro/image-to-video`)** via `clipper/higgsfield_mcp_client.py` to generate **Start➜End Frame AI Morph Transitions** (currently **15 AI morph transitions** across 80 timeline segments in the Brinks project, varying from `0.55s` to `1.30s` with `0` gaps and `0` black frames).
- Provides a scalable, mobile-friendly browser NLE (`clipper/app.py`) with:
  - **Zero-Flash Master Monitor** + double-buffered `<video>` fallback
  - **Persistent Angle Card Cache (`angleCardCache`)** so the 10 live angle preview videos never flash black during playback
  - **✨ AI Morph Transitions Badge Bar** directly below the monitor to jump to and audition every AI transition in 1 click
  - **1-Click `🎬 Export MP4` & `⬇️ Download MP4`** in both the top sticky header and transport bar

### Mandatory Reading Before Editing `clipper/`
1. `clipper/AI_HANDOFF_GUIDE.md` — Architecture, data contracts, and step-by-step AI transition splicing rules
2. `clipper/DOCS_AND_LESSONS.md` — 7 hard-earned engineering lessons, cost breakdown, and feature roadmap
3. `clipper/README.md` — Quickstart and API reference

### Quickstart
```bash
cd clipper
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
cp .env.example .env.local   # Add HIGGSFIELD_BEARER_TOKEN if generating new Kling clips
./.venv/bin/python app.py    # Runs on http://127.0.0.1:5050
```

---

## 🎞️ Product 2: Event Recap Reel Studio (`reel_studio/` — Port `5055`)

**Automated Event Highlight & Scrapbook Polaroid Reel Editor**

### What It Does
- Scans raw event/party footage (`input/clips/*.MOV`) + audio (`input/song/*`) with dense `0.25s` OpenCV windows (`reel_engine.py`) to detect smiles, faces, camera flash bursts, dance energy, and sharpness.
- Filters out dead footage (floors, walls, extreme blur) and assembles beat-synced highlight reels (`9:16` Vertical, `16:9` Horizontal, `1:1` Square) with **Scrapbook / Polaroid Collage Overlays** (`polaroid_stack`, `side_by_side_vertical`, `corner_pip`, `triple_scrapbook`), **Speed Ramps**, and **FFmpeg `xfade` / Whip-Pan / Flash Transitions**.
- Includes an interactive browser studio (`reel_studio/app.py`) with drag-and-drop reorder, media bin ingestion, per-cut inspector, and 1-click MP4 export.

### Mandatory Reading Before Editing `reel_studio/`
1. `reel_studio/AI_HANDOFF_GUIDE.md` — Architecture, pipeline stages, and non-negotiable invariants
2. `reel_studio/docs/LESSONS_LEARNED.md` — 9 engineering lessons (exact duration math, collage loop resilience, zero black frames)
3. `reel_studio/docs/FEATURES_AND_ROADMAP.md` — Shipped features (`v1.0`–`v2.2`) and `v3.0` roadmap

### Quickstart
```bash
cd reel_studio
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt
./.venv/bin/python app.py    # Runs on http://127.0.0.1:5055
```

---

## 🛡️ Non-Negotiable Engineering Invariants (For All Agents Working on `clipper/` or `reel_studio/`)

1. **Never Break Lip-Sync Lock (`clipper/`)**:
   - Every base cut must satisfy `abs((seg.song_start - seg.clip_in) - clip.song_offset_sec) < 0.005`.
   - When inserting an AI transition of duration `D` at boundary `cut_t = seg_a.song_end`, always carve `D/2` from `seg_a.song_end` (`seg_a.clip_out -= D/2`) and `D/2` from `seg_b.song_start` (`seg_b.clip_in += D/2`). Never shift downstream segments in song time.
2. **Splicing Multiple AI Transitions (`clipper/`)**:
   - Always iterate target `seg_index` values in **strictly descending order** (`63 -> 54 -> 40 -> 29 -> 11 -> 6`) so splicing at `seg_index + 1` never shifts earlier indices.
3. **Zero Black Frames in Exports (`clipper/` & `reel_studio/`)**:
   - Verify every rendered MP4 before completion with:
     ```bash
     ffmpeg -i <output.mp4> -vf "blackdetect=d=0.03:pix_th=0.10" -an -f null -
     ```
     and confirm `0` blackdetect lines.
4. **Zero DOM Destruction on `<video>` Preview Grids (`clipper/app.py`)**:
   - Never run `grid.innerHTML = ''` on `<video>` thumbnail grids during playback; mutate cards in-place via `angleCardCache`.
5. **Keep Living Docs Updated**:
   - Whenever any agent (`BRAIN`, `BLUE`, `RED`, `YELLOW`) ships a feature or bugfix in `clipper/` or `reel_studio/`, update `clipper/DOCS_AND_LESSONS.md` or `reel_studio/docs/LESSONS_LEARNED.md` + `FEATURES_AND_ROADMAP.md` in the same commit.
