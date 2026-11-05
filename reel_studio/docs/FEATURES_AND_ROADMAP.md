# Reel Studio — Feature Inventory, Active Configuration & Living Roadmap

> **Purpose**: Single source of truth for **what Reel Studio (`http://127.0.0.1:5055`) currently supports**, **how the current Temple Reel is configured**, **what we changed based on feedback**, and **what we plan to add or refine next**. Update this document on every iteration.

---

## 1. Current Active Reel Configuration (`output/reel_project.json`)

- **Output File**: [`output/cinematic_temple_reel_1080p.mp4`](file:///Users/kabirduggal/Desktop/ANTIGRAV/reel_studio/output/cinematic_temple_reel_1080p.mp4) (`1080x1920` Vertical 9:16, `30 fps`, `36.5s` total duration across **11 video cuts + 3 Scrapbook Photo flashes**, `BLACKDETECT_LINES: 0`)
- **Clip Reuse Rule**: **No video clip reuse** (`1 video clip = 1 best highlight cut`, `11 video cuts` total; shaky `IMG_5752.MOV` removed and the `~34s` finale replaced with the new sanctum installation clip `IMG_5292.mov`)
- **Transitions**: **Clean Regular Cuts (`transition = "none"`)** — zero black screen flashes
- **Audio Mode**: **Native Clip Audio ON (`muted = False, volume_pct = 100`, `mean_volume = -19.9 dB`)** — plays natural 1.0x pitch-preserved temple & ceremony audio on every cut so background music can be layered on top
- **Scrapbook Photo Pop-Up Effect**: The 3 temple photos flash up **on top of the playing video clips for a short `1.20s` burst** (`between(t, pop_t, pop_end)`) on **Cuts #2, #5, and #11** inside a clean, text-free Polaroid paper border with gold washi tape, 3D shadow, organic tilt, and a warm camera-shutter flash:

| Cut # | Timeline (`s`) | Base Video Clip (`volume_pct = 100%`) | Best Window (`in`–`out`) | Speed / Slow-Mo | 📸 Scrapbook Photo Pop-Up (Short `1.20s` Flash On Top of Video) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Cut #1** | `0.0s–2.8s` | `IMG_5246.mov` *(New — Rigging Stone Vigraha)* | `12.2s–15.0s` | `▶️ 1.0x` (`2.8s`) | *None* |
| **Cut #2** | `2.8s–6.2s` | `IMG_5946.mov` *(New — Stone Vigraha in Ceremonial Pool)* | `1.2s–3.6s` | `🎬 0.70x Slow-Mo` (`3.4s`) | **`PHOTO_1_Peetham_Installation.jpg`** (`1.20s` flash, `-3.2°` tilt) |
| **Cut #3** | `6.2s–9.0s` | `IMG_6215.mov` *(New — Ceremonial Basins & Sacred Leaves)* | `11.0s–13.8s` | `▶️ 1.0x` (`2.8s`) | *None* |
| **Cut #4** | `9.0s–12.5s` | `IMG_6071.mov` *(New — Pushpanjali Flower Offering)* | `9.2s–11.6s` | `🎬 0.70x Slow-Mo` (`3.4s`) | *None* |
| **Cut #5** | `12.5s–16.2s` | `IMG_0119.MOV` *(New — Close-Up Shiva Lingam Abhishekam)* | `14.2s–16.8s` | `🎬 0.70x Slow-Mo` (`3.7s`) | **`PHOTO_2_Shiva_Lingam_Alankaram.jpg`** (`1.20s` flash, `+2.8°` tilt) |
| **Cut #6** | `16.2s–20.1s` | `IMG_1250.mov` *(Grand Kalasha Procession Entry)* | `34.6s–37.4s` | `⚡ speed_ramp` (`3.9s`) | *None* |
| **Cut #7** | `20.1s–23.1s` | `IMG_5719.MOV` *(Sacred Yagna Priests & Bhajan Circle)* | `1.5s–4.5s` | `▶️ 1.0x` (`3.0s`) | *None* |
| **Cut #8** | `23.1s–26.1s` | `IMG_5753.MOV` *(Devotional Satsang & Tabla)* | `11.2s–14.2s` | `▶️ 1.0x` (`3.0s`) | *None* |
| **Cut #9** | `26.1s–29.2s` | `IMG_1289.MOV` *(Wide Main Hall Congregation Darshan)* | `4.6s–6.8s` | `🎬 0.70x Slow-Mo` (`3.1s`) | *None* |
| **Cut #10** | `29.2s–32.2s` | `IMG_6384.mov` *(New — Main Hall Vedic Sankalpa & Chanting)* | `52.8s–55.8s` | `▶️ 1.0x` (`3.0s`) | *None* |
| **Cut #11** | `32.2s–36.5s` *(at `34s`)* | `IMG_5292.mov` *(New — Upright Stone Lord Balaji Vigraha in Sanctum)* | `54.0s–57.0s` | `🎬 0.70x Slow-Mo` (`4.3s`) | **`PHOTO_3_Lord_Balaji_Darshan.jpg`** (`1.20s` flash, `-1.8°` tilt — Finale!) |

---

## 2. Current Feature Set (`app.py` + `reel_engine.py`)

### A. Media Ingestion & Parallel AI Analysis
- **Multi-Format Support**: Ingests both **Event Videos** (`.mov`, `.mp4`, `.m4v`, `.webm`, `.mkv`) and **Event Photos** (`.jpg`, `.jpeg`, `.png`, `.heic`, `.webp`) via drag-and-drop or **🔄 Scan Folder** (`input/clips/`).
- **Hardware Proxy Generation**: Generates lightweight `540p` browser proxies and thumbnails using Apple Silicon `h264_videotoolbox`.
- **4Hz Visual + Audio Excitement Curves**: Computes 4Hz visual motion/sharpness (Gold curve) and native audio energy (Cyan curve) for instant peak-window detection and interactive trimming.

### B. Scrapbook Photo Pop-Up Engine (NEW)
- **Physical Polaroid / Scrapbook Overlay (`render_scrapbook_photo_overlay_png`)**:
  - Composites any uploaded photo **on top of a playing video cut** without stopping or replacing the underlying video.
  - **3 Frame Styles**:
    1. `polaroid_tape` — Warm ivory Polaroid paper border, inner gold hairline + bottom diamond emblem, and translucent gold washi tape at the top.
    2. `gold_foil` — Deep temple crimson/obsidian frame with double sacred gold foil borders.
    3. `vintage_print` — Warm parchment border with vintage gold tape.
  - **Customizable Pop-Up Timing**:
    - `pop_after_1s` (Default: video plays clean for `~1.15s`, then shutter-flashes the photo on top for the rest of the cut).
    - `pop_early` (Flashes in at `~0.60s`).
    - `full` (Visible across the entire cut).
  - **Customizable Tilt Angle**: `-8.0°` to `+8.0°` slider in the Cut Inspector + live WYSIWYG stage preview (`#stageScrapbookWrap` + `#stageShutterFlash`).

### C. Speed, Slow-Motion & Film Grades
- **5 Speed Modes**: `1.0x` Real-Time, `0.70x` Silky Slow-Mo, `0.55x` Dreamy Slow-Mo, `speed_ramp` (Fast `1.35x` entry into `0.55x` Slow-Mo), and `1.25x` Fast Cut.
- **Cinematic Film Looks**: `warm_temple` (Sacred Temple Gold Glow), `cinematic_film` (Warm Kodak-style contrast), `ken_burns_in`, `ken_burns_out`, `punch_zoom`, `cinema_glow`, and standalone Living Photo 3D motion presets (`photo_parallax_in`, `photo_polaroid_gold`, `photo_reveal_out`, `photo_pan_drift`).
- **Aspect Ratio Framing**: Instant toggle between **📱 9:16 Vertical (`1080x1920`)** and **🖥️ 16:9 Horizontal (`1920x1080`)**, with per-cut **🌫️ Blurred Backdrop Fill (`blur_pad`)** or **🔍 Smart Center Fill (`cover`)**.

### D. Zero-Flash Dual-Deck Stage & Interactive 4Hz Trimmer
- **Dual-Deck HTML5 Preview (`#previewVideoA` + `#previewVideoB`)**: Preloads the next cut on a hidden standby video deck so cut transitions happen in `0ms` with zero black flash.
- **Interactive 4Hz Canvas Trimmer**: Drag `[IN / OUT]` handles, click **✨ Peak Highlight**, **🗣️ Spoken Moment**, **↔ Full Clip**, **✂️ Split**, or **⧉ Reuse Clip**.

### E. Audio & Title Overlays
- **Balaji Song / Soundtrack Mode**: One-click mute across all cuts (`muted = True, volume_pct = 0`) or upload an `.mp3`/`.wav`/`.m4a` track in **🎵 Music & Event Banner** with optional auto-ducking.
- **Per-Cut Lower-Thirds & Global Event Banner**: Customizable title/subtitle overlays (`temple_gold`, `pill_dark`, `editorial_box`, `minimal_glow`), or completely clean (`overlay_text = ""`) when pure visuals are preferred.

---

## 3. Iteration & Change Log (What We Changed & Why)

| Iteration | User Feedback / Goal | What We Changed |
| :--- | :--- | :--- |
| **v1.0** | Build standalone Event & Temple Recap Reel Studio (`port 5055`) | Created `reel_studio/app.py` + `reel_engine.py` with 4Hz visual/audio excitement curves, trimmer, and VideoToolbox export. |
| **v2.0** | *"make it more cinematic maybe add some slow motions effects... engaging for someone on instagram scrolling"* | Added `0.70x` Slow-Mo, `0.55x` Dreamy Slow-Mo, `speed_ramp`, and `warm_temple` / `cinematic_film` color grading. |
| **v2.1** | *"actually dont reuse clips this time and the transitions are like black screen flashes why arent they regular cuts"* | 1. Enforced **1 cut per video clip** (no clip reuse).<br>2. Removed dip-to-black fades (`transition="none"`, verified `BLACKDETECT_LINES: 0`).<br>3. Built **Dual-Deck Preloaded Video Player** (`#previewVideoA` / `#previewVideoB`) for zero-flash browser cuts. |
| **v2.2** | *"they want to add some photos in as well... also we will end up using a balaji song over the whole thing so you dont need to worry about audio"* | 1. Added photo ingestion (`IMAGE_EXTS`) and imported the 3 temple photos.<br>2. Muted all clip audio (`muted=True, volume_pct=0`) for the Balaji song. |
| **v2.3** | *"can you have the photos flash up like on top of the video sort of like a scrapbook effect"* + *"write docs to remember the lessons... keep track of the current set of features"* | 1. Built **Scrapbook Polaroid Pop-Up Engine** (`render_scrapbook_photo_overlay_png` + FFmpeg timed overlay + shutter flash).<br>2. Paired the 3 photos on top of Video Cuts #1, #3, and #5 while keeping the 5 videos as a continuous 5-cut timeline.<br>3. Added live WYSIWYG Scrapbook preview & Cut Inspector controls.<br>4. Created `docs/LESSONS_LEARNED.md` and `docs/FEATURES_AND_ROADMAP.md`. |
| **v2.4 (Current)** | *"could you do a full ui audit and then make improvements based on similar products"* | 1. **Scalable & Mobile-Friendly Layout**: Added `<meta name="viewport">`, sticky `flex-wrap` header, `overflow-y: auto` body, and responsive `@media (max-width: 1180px / 768px)` breakpoints.<br>2. **CapCut-Style Mobile Workspace Tab Switcher**: Added `📂 Media Bin | 🎬 Stage & Trimmer | 🎛️ Cut Inspector` tab bar on tablet/mobile.<br>3. **Segmented Full-Reel Progress Bar (`#reelProgressRibbon`)**: Proportional scene blocks below the stage with `📸` Polaroid and `⚡` Slow-Mo markers.<br>4. **Direct `⬇️ Download MP4` & `🚀 Export MP4`**: Placed in both the sticky header and the stage transport bar, auto-linked via `latest_export_url`. |

---

## 4. Living Roadmap: What We Want to Add or Change Next

### Near-Term Enhancements (Ready to Build on Request)
- [ ] **Multi-Photo Scrapbook Collage Stack**: Option to have **2 or 3 photos stack sequentially** on top of a single longer video cut (e.g., Photo A pops in at `1.0s` tilted `-3.5°`, then Photo B lands on top at `2.4s` tilted `+3.0°` like physical prints being tossed onto a table).
- [ ] **Scrapbook Handwritten Caption on Polaroid Chin**: Option to print a custom gold/ink caption (e.g., *"Sri Balaji Alankaram"*) directly inside the bottom ivory chin of the Polaroid frame instead of a separate video lower-third.
- [ ] **Slide-In / Drop-In Spring Motion in Exported MP4**: Animate the Polaroid overlay's `x/y` coordinates in FFmpeg (`overlay=x=...:y=...`) over the first `0.18s` of `pop_t` so the Polaroid physically slides/drops onto the video frame alongside the camera-shutter flash.
- [ ] **Beat-Synced Cut & Scrapbook Pop-Up Snapping**: When the Balaji song audio file is uploaded into `input/music/`, detect drum/tala transients and automatically snap video cuts and Scrapbook Photo `pop_t` timestamps to the exact musical beat.
- [ ] **Torn-Edge Paper & Vintage Stamp Stickers**: Additional scrapbook border textures (deckled/torn handmade paper edges, sacred temple lotus/shankha/chakra gold corner stamps).
