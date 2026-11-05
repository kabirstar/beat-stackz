# Recap Reel Studio — AI-to-AI Handoff & Reproduction Blueprint (`:5055`)

This document enables any AI coding agent or developer to understand, reproduce, and extend **Event Recap Reel Studio** (`reel_studio/`), a cinematic mixed-media (video + Scrapbook Polaroid photo pop-up) reel editor running on `http://127.0.0.1:5055`.

---

## 1. Quickstart

```bash
cd reel_studio
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Place video clips (.mov/.mp4) and photos (.jpg/.png) in input/clips/
mkdir -p input/clips input/music output/proxies

# Launch Recap Reel Studio on http://127.0.0.1:5055
./.venv/bin/python app.py
```

---

## 2. Architecture & Storyboard Data Model (`reel_engine.py`)

### 2.1 `ReelClipMeta` & Smart Highlight Scoring (`analyze_video_visuals_4hz`)
Every video in `input/clips/` is sampled at `4 Hz` (`320x180`) to compute:
- **Center 70% Sharpness**: Laplacian variance in the central subject region.
- **Luma Contrast & Saturation**: Std-dev of luminance (`55 <= mean_luma <= 215`) + HSV saturation.
- **Motion Stability**: Rewards purposeful ceremonial motion (`1.0 <= diff <= 13.5`) while heavily penalizing camera whip-pans or phone-lowering blur (`diff > 13.5`).
- **Head/Tail Guards**: `suggest_highlight_window` skips the first `8%` and last `6%` of long clips (`>= 12s`) so setup/phone-lowering frames are never auto-selected.

### 2.2 `ReelSegment` Dataclass (`output/reel_project.json`)
```json
{
  "seg_id": "cut_02",
  "index": 1,
  "clip_id": "clip_IMG_5946",
  "filename": "IMG_5946.mov",
  "filepath": "/abs/path/to/reel_studio/input/clips/IMG_5946.mov",
  "proxy_url": "/proxies/proxy_IMG_5946.mp4",
  "media_type": "video",
  "clip_in": 1.2,
  "clip_out": 3.6,
  "timeline_start": 2.8,
  "timeline_end": 6.23,
  "playback_rate": 0.7,
  "speed_mode": "slow_mo",
  "transition_out": "none",
  "transition_dur": 0.0,
  "color_grade": "warm_gold",
  "volume_pct": 100,
  "muted": false,
  "scrapbook_photo": "PHOTO_1_Peetham_Installation.jpg",
  "scrapbook_style": "polaroid_tape",
  "scrapbook_timing": "mid_pop",
  "scrapbook_tilt": -3.2
}
```

### 2.3 Scrapbook Polaroid Photo Pop-Up Overlay Pipeline
Instead of interrupting the video flow with static full-screen photo slides, photos are composited **on top of the playing video cut** (`_render_single_storyboard_segment`):
1. `render_scrapbook_photo_overlay_png` generates a transparent RGBA PNG (`1920x1080`) containing the photo framed inside a clean blank Polaroid paper border with a translucent gold washi tape strip at the top and a 3D drop shadow, rotated by `scrapbook_tilt` degrees (`-3.2°`, `+2.8°`, `-1.8°`).
2. FFmpeg overlays the RGBA PNG onto the moving video for a **short `1.20s` burst** (`enable='between(t, pop_t, pop_end)'`, where `pop_t = 0.95s` and `pop_end = 2.15s`) accompanied by a `0.10s` warm camera-shutter flash (`colorkey` / `eq` brightness pulse at `pop_t`), after which the photo disappears so the video cut finishes playing unobstructed.

---

## 3. Companion Documentation in `reel_studio/docs/`
- [`docs/LESSONS_LEARNED.md`](docs/LESSONS_LEARNED.md) — Engineering lessons on FFmpeg `xfade` timebase pitfalls, highlight selection guards, native audio normalization, and blank Polaroid overlays.
- [`docs/FEATURES_AND_ROADMAP.md`](docs/FEATURES_AND_ROADMAP.md) — Complete feature inventory and upcoming roadmap.
