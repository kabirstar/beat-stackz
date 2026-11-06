# Reel Studio — Engineering & Creative Lessons Learned

> **Living Knowledge Base**: Every technical, visual, and UX lesson learned while building and refining **Reel Studio (`http://127.0.0.1:5055`)**. Always read and update this file whenever user feedback reveals a better pattern or a bug is fixed.

---

## 1. Zero-Flash Transitions & Dual-Deck Browser Playback

### What Happened
- **Symptom 1 (Exported MP4)**: Early versions used `fade=t=in / fade=t=out` (dip-to-black) on segment boundaries, which looked like jarring black screen flashes between cuts instead of clean regular cuts.
- **Symptom 2 (Browser Preview)**: Using a single HTML5 `<video>` element and switching `video.src = nextItem.proxy_url` on cut boundaries caused the browser to blank out for `100–250ms` while decoding the first frame of the next clip.

### Lesson & Permanent Rule
1. **Default to Clean Regular Hard Cuts (`transition = "none"`)**:
   - Never apply dip-to-black (`fade=t=in:st=0` / `fade=t=out`) on video cuts unless explicitly requested.
   - Verify every exported MP4 with FFmpeg `blackdetect=d=0.05:pix_th=0.10` and assert **`BLACKDETECT_LINES: 0`**.
2. **Dual-Deck Preloaded HTML5 Video Player (`#previewVideoA` + `#previewVideoB`)**:
   - While the active `<video>` deck plays Cut $N$, the standby `<video>` deck preloads `nextItem.proxy_url` and seeks to `nextItem.in_sec` in the background.
   - At the cut boundary, swap `.active-deck` and `.standby-deck` CSS classes in `0ms`—eliminating browser black flashes completely.

---

## 2. Clip Reuse vs. One-Cut-Per-Clip Discipline

### What Happened
- Initially, longer clips (`34s–54s`) were split into multiple scenes and interleaved (`11 cuts` from `5 videos`).
- While multi-scene interleaving works when footage is scarce, the user preferred **not reusing clips** (`1 video clip = 1 best highlight cut`) so every cut feels fresh and distinct.

### Lesson & Permanent Rule
- **Default Storyboard Policy**: Use **1 peak highlight cut per video clip** (`5 video clips = 5 cuts`) by default.
- Keep multi-scene splitting (`⧉ Reuse Clip` / `✂️ Split`) available as an **opt-in** manual action in the trimmer toolbar rather than forcing clip reuse in `build_cinematic_instagram_storyboard`.

---

## 3. Incorporating Event Photos: Scrapbook Polaroid Pop-Up on Top of Video

### What Happened
- First attempt at adding the 3 temple photos (`PHOTO_1_Peetham_Installation.jpg`, `PHOTO_2_Shiva_Lingam_Alankaram.jpg`, `PHOTO_3_Lord_Balaji_Darshan.jpg`) inserted them as standalone full-screen photo cuts between the videos (`8 cuts` total).
- User feedback: *"can you have the photos flash up like on top of the video sort of like a scrapbook effect"*.

### Lesson & Permanent Rule
- **Scrapbook Pop-Up Overlay Pattern (`render_scrapbook_photo_overlay_png`)**:
  - Instead of stopping the video timeline for static photo slides, keep the **video clips playing continuously** in the background and **flash the photos ON TOP of the playing video for a short, snappy burst (`~1.20s` via `between(t, pop_t, pop_end)`)**:
    - Video plays clean for the first `~0.95s`,
    - The photo flashes up on top for `1.20s` (`0.95s` to `2.15s`),
    - Then the photo disappears so the remainder of the video cut finishes playing clean!
  - **Visual Polish & Zero-Text Rule**:
    1. **NEVER Add Any Text or Ornaments on the Photos**: Keep the Polaroid paper border 100% clean (no *"SACRED MEMORY"* label in the browser editor, no decorative lines/emblems on the bottom chin).
    2. **Uncropped Photo Aspect Ratio**: Fit the photo inside ~78% of the `1080x1920` frame so the moving video remains clearly visible around all 4 edges.
    3. **Clean Warm Ivory Polaroid Paper Border + Translucent Gold Washi Tape**: Simple paper frame (`pad_side=26`, `pad_top=26`, `pad_bottom=38`) pinned at the top center by a translucent gold tape strip.
    4. **Deep 3D Drop Shadow & Organic Tilt**: Gaussian-blurred drop shadow (`radius=22`, `offset=(8, 18)`) and bicubic rotation (`-3.2°`, `+2.8°`, `-1.8°`) so each print feels hand-placed.
    5. **Warm Camera-Shutter Flash at Pop-In (`pop_t`)**: A `0.10s` warm brightness/contrast pulse (`eq=brightness=0.13:contrast=1.05:enable='between(t,pop_t,pop_t+0.10)'`) right when the Polaroid lands on screen.

---

## 4. Audio Modes: Native Event Audio vs. Full-Reel Song Mode (Balaji Song)

### What Happened
- For reels where an external devotional song (e.g., a **Balaji song** on Instagram or uploaded in the studio) will play over the entire timeline, original crowd/room audio isn't needed.
- Conversely, when native audio *is* used on Slow-Motion cuts (`0.70x`, `0.55x`), time-stretching room audio with `atempo=0.55` sounds robotic/warbly.

### Lesson & Permanent Rule
1. **Song Mode (`muted=True, volume_pct=0`)**:
   - When the user plans to use a song over the whole reel, default all cuts to `muted=True, volume_pct=0` while still encoding a clean silent AAC stream (`anullsrc`) so downstream social platforms and video players see a valid audio track.
2. **Natural J/L-Cut Audio on Slow-Mo (When Native Audio is Enabled)**:
   - Never apply `atempo < 0.85` to ambient/crowd/chant audio. Instead, play a continuous `1.0x` real-time audio window (`src_in -> src_in + target_dur`) across the slow-motion visual cut with micro `0.06s` de-click fades at cut boundaries.

---

## 5. Smart Visual Highlight Detection (Avoiding Hallway Walks & Phone-Lowering Spikes)

### What Happened
- When 7 new handheld clips (`IMG_0119.MOV`, `IMG_5246.mov`, `IMG_5292.mov`, `IMG_5946.mov`, `IMG_6071.mov`, `IMG_6215.mov`, `IMG_6384.mov`) were uploaded, a naive frame-difference scorer (`motion = min(diff / 16.0, 2.0)`) made two classic mistakes on long clips:
  1. On `IMG_5292.mov` (`65.0s`), it picked `2.8s–6.2s` (blurry hallway walk before entering the sanctum) instead of `49.0s–52.0s` (the historic reveal of the upright stone Vigraha installed on the Peetham).
  2. On `IMG_6384.mov` (`110.9s`), it picked `107.0s–110.4s` (the motion spike at the very end when the cameraperson lowered the phone to stop recording) instead of `52.8s–55.6s` (priests chanting Vedic Sankalpa under the crystal chandeliers).

### Lesson & Permanent Rule
1. **Center-Region Sharpness + Whip-Pan Penalty (`analyze_video_visuals_4hz`)**:
   - Measure Laplacian sharpness and contrast inside the **center 70% crop** (`[0.15..0.85]`) where ceremonial subjects live.
   - Treat moderate 4Hz frame differences (`diff <= 13.5`) as purposeful ceremonial motion, and **heavily penalize extreme frame differences (`diff > 13.5`)** caused by camera whip-pans, walking blur, or phone drops.
   - Apply a `0.55x` blur penalty whenever a frame's sharpness drops below `68%` of the clip's median sharpness.
2. **Start/End Recording Guards + Window Consistency (`suggest_highlight_window`)**:
   - On clips `> 15s`, automatically guard the first `max(1.4s, 8% of duration)` (raising phone / walking in) and the last `max(1.8s, 6% of duration)` (lowering phone to hit stop).
   - Score candidate windows by `0.64 * mean + 0.22 * p25 + 0.14 * max - 0.18 * std` so a steady, consistently sharp ceremonial action beats a momentary camera jerk.
3. **Visual Contact-Sheet Verification**:
   - Whenever new clips are added, generate an 8-column timestamped contact sheet (`output/inspect_frames/`) and visually verify that every chosen `[in_sec, out_sec]` window frames the true ceremonial peak and fits a chronological story arc.

---

## 6. Cinematic Pacing & Speed-Ramps (`h264_videotoolbox`)

### Lesson & Permanent Rule
- **Mix Speed Modes Intentionally**:
  - Combine **Hero Speed-Ramps (`speed_ramp`)** on procession/entry shots, **1.0x Real-Time** on rhythmic/musical shots (Tabla, Bhajan clapping), and **0.70x Silky Slow-Mo** on sacred sanctum/shrine reveals.
- **Normalize Every Segment Before Concat**:
  - Every segment rendered by `_render_single_storyboard_segment` must output identical `1080x1920` (or `1920x1080`), `30 fps`, `yuv420p`, `h264_videotoolbox` video and `44100 Hz` stereo AAC audio so `concat=n=N:v=1:a=1` never stutters or drops frames.

## 8. Anti-"AI Slop" Studio NLE Design System Overhaul
- **Problem**: Neon pink/purple button gradients (`#ff2a85` to `#7c3aed`), purple-tinted headers (`#13111c`), and emoji-stuffed controls gave the editor a generic "AI-generated SaaS template" look and skewed color perception next to the video viewport.
- **Solution**:
  - Replaced tinted surfaces and neon gradients with a calibrated **Rec.709 Neutral Zinc Studio Palette** (`--bg: #0a0a0c`, `--panel: #111115`, `--panel2: #17171c`, `--panel3: #1f1f26`, `--border: #26262f`, Industrial Amber `--gold: #f59e0b`, Tally Emerald `--green: #10b981`).
  - Applied `font-variant-numeric: tabular-nums` and `--mono` (`SF Mono`, `JetBrains Mono`) to all timecode displays, storyboard cut badges, and inspector readouts.
  - Replaced emoji-heavy toolbar and inspector labels with crisp NLE console headings (`9:16 VERTICAL`, `16:9 HORIZONTAL`, `BUILD STORYBOARD`, `RENDER 1080P MP4`, `01 / SPEED, SLOW-MO & GRADE`, `02 / SCRAPBOOK PHOTO OVERLAY`, `03 / NATIVE CLIP AUDIO`, `04 / LOWER-THIRD & TITLE OVERLAY`).
