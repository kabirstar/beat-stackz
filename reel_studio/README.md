# 🏛️ Reel Studio (`port 5055`) — Cinematic Event & Temple Recap Editor

Standalone visual storyboard editor and hardware-accelerated (`h264_videotoolbox`) 1080p Reel renderer for event, ceremony, and temple highlight reels.

## 📚 Living Documentation (Read Before Making Changes)
- **[`docs/LESSONS_LEARNED.md`](docs/LESSONS_LEARNED.md)** — Permanent engineering & creative rules learned from user feedback (Zero-Flash Dual-Deck player, 1-cut-per-clip non-reuse discipline, Scrapbook Polaroid Pop-Ups on top of playing video, Balaji Song audio mode, Slow-Mo sync).
- **[`docs/FEATURES_AND_ROADMAP.md`](docs/FEATURES_AND_ROADMAP.md)** — Complete feature inventory, active 5-cut + 3-Scrapbook-Photo reel configuration, iteration changelog, and living roadmap of upcoming enhancements.

## 🚀 Quick Start

```bash
cd /Users/kabirduggal/Desktop/ANTIGRAV/reel_studio
/Users/kabirduggal/Desktop/ANTIGRAV/clipper/.venv/bin/python3 app.py
```

Open **`http://127.0.0.1:5055`** in your browser.

## 📂 Directory Structure
- `app.py` — Flask web studio (`http://127.0.0.1:5055`) with Dual-Deck zero-flash video stage, live WYSIWYG Scrapbook Polaroid pop-up preview, 4Hz excitement trimmer, and Cut Inspector.
- `reel_engine.py` — 4Hz visual/audio excitement analyzer, `render_scrapbook_photo_overlay_png` Polaroid + gold washi tape renderer, Slow-Mo/Speed-Ramp filtergraph builder, and parallel `h264_videotoolbox` 1080p exporter.
- `input/clips/` — Raw event video clips (`.mov`, `.mp4`) and scrapbook photos (`.jpg`, `.png`, `.heic`).
- `input/music/` — Optional full-reel soundtrack / Balaji devotional song files.
- `output/cinematic_temple_reel_1080p.mp4` — Latest rendered 1080x1920 vertical Instagram Reel (`BLACKDETECT_LINES: 0`).
- `output/reel_project.json` — Active project state.
