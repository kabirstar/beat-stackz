# Clipper Studio — Engineering Lessons, Feature Tracker & Roadmap

Last Updated: 2026-11-04

This living document tracks every architectural lesson learned while building and refining **Clipper Studio** (`http://127.0.0.1:5050`) and **Recap Reel Studio** (`http://127.0.0.1:5055`), the current production feature set, and our ongoing backlog of improvements.

---

## 1. Hard-Won Lessons Learned (Apply to Every Future Edit & Render)

### 1.1 Zero Lip-Sync Drift (`song_offset_sec` Invariant)
- **Lesson**: In multi-camera music videos (`Brinks`, etc.), every synced performance angle has a ground-truth acoustic offset `song_offset_sec` computed via multi-band onset cross-correlation against the master audio track (`Brinks.wav`).
- **Rule**: Every base performance cut **must** satisfy:
  ```
  abs((seg.song_start - seg.clip_in) - clip.song_offset_sec) < 0.005
  ```
- **Trap to Avoid**: Never shift `clip_in` independently of `song_start` when trimming or inserting transitions, and never insert a transition by pushing later segments forward in song time. Always **carve** transition windows (`dt/2` from the tail of Outgoing Shot A and `dt/2` from the head of Incoming Shot B) while advancing Shot B's `clip_in` by `dt/2`.

### 1.2 Eliminating Cumulative Sub-Frame Duration Drift (Telescoping Frame Bounds)
- **Lesson**: When rendering 60–80+ rapid cuts at `30.0 fps` and concatenating with `ffmpeg -f concat`, rounding each segment's duration independently (`round(seg_dur * fps) / fps`) accumulates `+0.01s` to `+0.15s` of drift over a 103-second timeline.
- **Rule**: Always compute exact integer frame boundaries relative to timeline start (`actual_start`) in `_render_single_segment_worker`:
  ```python
  f_start = int(round((seg.song_start - actual_start) * fps))
  f_end = int(round((seg.song_end - actual_start) * fps))
  exact_frames = max(1, f_end - f_start)
  seg_dur = exact_frames / float(fps)
  ```
  Because `f_end` of segment `i` equals `f_start` of segment `i+1`, the sum of frames across all segments telescopes to the exact master audio frame count (`0.000s` cumulative drift).

### 1.3 Reverse-Order Splicing for Batch AI Transitions
- **Lesson**: Splicing an AI transition at cut boundary `seg_index` inserts a new segment at `seg_index + 1`, shifting the indices of all subsequent segments by `+1`.
- **Rule**: Whenever generating multiple AI transitions in a batch, **always sort target `seg_index` values in strictly descending order** (e.g., `65 -> 53 -> 33 -> 19 -> 15 -> 1`). Splicing from the end of the timeline toward the beginning guarantees earlier target indices never shift.

### 1.4 AI Transition Boundary Selection & Varied Pacing
- **Lesson**: AI morph transitions (`higgsfield_kling` Kling 3.0 Pro start+end frame morphs) look best when:
  1. **Visual anchors bridge the two shots**: e.g., an outstretched hand or index finger morphing into a golden saxophone, a chest logo pull-back dissolving an indoor room into a night driveway, or a night turf field folding into a car interior.
  2. **Lengths vary with musical phrasing (`0.55s` to `1.30s`)**: Fast rap pockets call for punchy `0.55s–0.65s` portal/hand morphs; atmospheric hooks or outro transitions breathe better at `0.95s–1.30s`.
  3. **Start & End frames are inspected first**: Always extract and inspect the exact boundary frames (`seg_a.clip_out - dt/2` and `seg_b.clip_in + dt/2`) before spending API credits so prompts describe the real subjects, wardrobe, lighting, and camera motion.
- **Cost Awareness**: Kling 3.0 Pro (`kling-video/v3.0/pro/image-to-video`) generates a minimum `5.0s` source clip per call (`~$0.21–$0.42` per generation) which we then time-warp (`setpts`) to the exact target transition duration (`0.55s–1.30s`).

### 1.5 Film Quality Enhancement (DLSS-Style Detail vs. Over-Processing)
- **Lesson**: Handheld night-shoot footage suffers from high-ISO chroma noise in shadows and H.264/HEVC motion softness, while AI-generated transition clips (`720p/1080p` from Kling/Veo) have slightly softer micro-texture than native 4K camera plates.
- **Rule**: Apply **3D Temporal Denoising (`hqdn3d=1.8:1.4:3.0:2.5`) + Lanczos Upscaling + AMD FidelityFX Contrast-Adaptive Sharpening (`cas=0.45`)** before final `yuv420p` encoding. It recovers micro-contrast and unifies native camera shots with AI transition clips without plastic AI haloing.

### 1.6 Color Grading Must Be Non-Destructive & Optional (`color_grade="none"` Default)
- **Lesson**: Baked-in heavy stylized grades (like dark teal/amber LUTs) can crush shadow detail on night shoots or alter skin/wardrobe tones in ways the director didn't ask for.
- **Rule**: Keep `color_grade="none"` (**Original Camera Color**) as the default for renders while exposing 1-click LUT/curve presets (`kodak_2383`, `night_trap`, `bleach_bypass`, `warm_vintage`) as non-destructive options in the Studio UI.

---

## 2. Current Feature Set (`clipper/app.py` & `clipper/clipper_engine.py`)

| Category | Feature | Status | Implementation Location |
|---|---|---|---|
| **Audio Sync** | Multi-band spectral onset cross-correlation (`sync_clip_to_song`) | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L469-L569) |
| **Visual Lip-Sync** | MediaPipe FaceMesh mouth-aperture (`MAR`) correlation against vocal envelope | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L616-L793) |
| **Beat & Fast-Rap Detection** | Librosa beat grid, 808 sub-bass hits, high-onset fast-rap cadence detector | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L220-L466) |
| **Multi-Angle Auto-Director** | Energy-weighted round-robin angle switching across all synced takes (`no-monopoly` cap) | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L1400-L1760) |
| **AI Morph Transitions** | **Higgsfield Kling 3.0 Pro** (`kling-video/v3.0/pro/image-to-video` start+end frame locked), **Vertex Veo 3.1**, **FFmpeg Minterpolate** | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L2282-L2462) |
| **Varied Transition Durations** | Per-cut duration control (`0.25s` to `2.50s`) with zero-drift lip-sync carving | Production | [`app.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/app.py#L380-L464) |
| **Quality Engine (DLSS-style)** | `hqdn3d` 3D temporal denoise + `lanczos` + AMD FidelityFX `cas` (`standard`, `cas_crisp`, `ultra_cinema`) | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L1860-L1955) |
| **Optional Color Grading** | Default `none` (Original Color) + selectable `kodak_2383`, `night_trap`, `bleach_bypass`, `warm_vintage` | Production | [`clipper_engine.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/clipper_engine.py#L1860-L1955), [`app.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/app.py#L465-L495) |
| **Interactive Web NLE** | Multi-track timeline, live preview player, per-cut camera swap dropdown, 1-click `✨ AI` transition modal | Production | [`static/index.html`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/static/index.html), [`static/app.js`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/static/app.js) |
| **Event Recap Reel Studio** | Dedicated photo+video mixed montage builder with beat-synced cuts & Ken Burns motion (`:5055`) | Production | [`recap_studio/`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/recap_studio/app.py) |

---

## 3. What We Want to Add / Improve Next (Backlog & Roadmap)

1. **Smart Auto-Transition Recommender ("Find Best Morph Cut Points")**
   - Automatically score every cut boundary `[i -> i+1]` by comparing pose/composition similarity and visual contrast between `Frame A` and `Frame B`, surfacing the top 5–8 "High-Impact Morph Candidates" in the UI with auto-drafted prompts and suggested durations (`0.55s` vs `1.20s`).
2. **Ease-In / Ease-Out Speed Ramp Curve on AI Transitions**
   - Currently, the `5.0s` Kling 3.0 Pro clip is linearly time-warped (`setpts={ratio}*PTS`) to fit `duration_sec`. Adding a non-linear ease-in / fast-middle / ease-out speed curve will make the start and end of the morph match the natural camera velocity of Shot A and Shot B before accelerating through the morph midpoint.
3. **Live Before/After Color Grade & CAS Preview in the Browser Player**
   - Apply CSS/SVG filter approximations of `kodak_2383`, `night_trap`, `bleach_bypass`, and `warm_vintage` directly over the HTML5 `<video>` preview in `http://127.0.0.1:5050` so you can audition grades in real time before clicking Export.
4. **Cached AI Transition Library & Non-Destructive Toggle**
   - Store original pre-carved `[seg_a, seg_b]` bounds inside the transition segment metadata so any AI transition in the timeline can be toggled on/off, resized (`0.6s <-> 1.1s` without re-billing the API by re-warping the cached raw 5s Kling MP4), or reverted in 1 click.
5. **Local Apple Silicon (`mps`) Real-ESRGAN / RIFE Optional Pass**
   - Add an optional neural 2x super-resolution & 60fps optical flow pass specifically on the short `0.55s–1.30s` AI transition clips (where processing only 20–40 frames takes seconds on M-series GPU) so AI transitions match 4K native sensor sharpness even on ultra-closeups.


### 1.7 Preventing Black Flashing Between Shots in the Web Preview Player
- **Root Cause**: Switching `programVideo.src = seg.proxy_url` on a single HTML5 `<video>` element at every cut boundary (`74` times across a song) causes the browser's hardware decoder to unload the previous stream and flash the `<video>` black background (`80–150ms`) while seeking to `seg.clip_in` in the next file.
- **Fix Applied**:
  1. **Zero-Flash Seamless Master Playback**: `api_get_project` and `api_export` attach `latest_export_url` (`/output/triller_horizontal_1793847628.mp4`, verified with `ffmpeg blackdetect` = `0` black frames) to the project state. `syncProgramMonitor` plays that single continuous stitched MP4 stream directly so `.src` never changes across all 74 cuts.
  2. **Double-Buffered Proxy Preloader**: When previewing un-exported cut edits, `#programVideoBuffer` pre-loads and pre-seeks `segments[segIdx + 1].proxy_url` ahead of the cut boundary.
  3. **Clean Monitor Screen**: Removed the `.monitor-lyric-overlay` (`#liveLyricText`) from the video monitor so lyrics never cover the video frame, and added the **✨ AI Morph Transitions in Timeline (`#aiTransitionsBarWrap`)** pill bar directly below the player so every AI transition's Cut #, timestamp, duration, and camera pair can be seen and previewed in 1 click.


### 1.8 Scalable, Scrollable & Mobile-Friendly UI Layout (`app.py`)
- **Root Cause**: A rigid `height: 100vh; overflow: hidden;` on `html, body` combined with a fixed `header { height: 50px; }` caused wrapped header buttons (`🎬 Export MP4`) and lower monitor controls to be clipped whenever the browser window was narrower than ~1500px or viewed on a laptop/mobile screen.
- **Fix Applied**:
  1. Added `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />`.
  2. Changed `html, body` to `min-height: 100vh; overflow-x: hidden; overflow-y: auto;` and `<header>` to `height: auto; min-height: 52px; flex-wrap: wrap; position: sticky; top: 0;` so nothing is ever clipped.
  3. Placed **`🎬 Export MP4`** and a 1-click **`⬇️ Download MP4`** button (`href="/output/triller_horizontal_1793849733.mp4"`) in **both** the top sticky header and the video monitor's transport bar right under the player.
  4. Added responsive breakpoints (`@media (max-width: 1024px)` and `@media (max-width: 640px)`) that stack the 2-column workspace vertically on smaller viewports and cap `.monitor-stage-wrap` at `aspect-ratio: 16 / 9; max-height: 48vh;`.


### 1.9 Eliminating Camera Angle Preview Card Flashing (`angleCardCache` in `app.py`)
- **Root Cause**: During playback, `followPlayheadToActiveCut(t)` called `setSelectionRange(..., fromPlayheadFollow=true)` on every cut boundary (80 times per song), which called `renderTakePicker()` and executed `grid.innerHTML = ''` — destroying and recreating all 10 `<video src="...">` thumbnail preview cards every ~1.2 seconds and triggering 10 simultaneous HTTP range requests + black decoder flashes on every cut!
- **Fix Applied**:
  1. Added a persistent `angleCardCache` in [`app.py`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/app.py#L2250-L2380) (`getOrCreateAngleCard`) so each camera angle's `<div class="take-card">` and `<video>` element is created **only once** and mutated in-place (updating `.active-take` border and text badges without ever destroying or reloading `<video>` nodes).
  2. When `fromPlayheadFollow === true`, `setSelectionRange` updates timeline selection classes and angle badges in-place without rebuilding DOM trees or seeking thumbnail `<video>` elements during playback.

### 1.10 Benchmark NLE UI Audit & Upgrades (Runway / FCPX Multicam / Descript)
- **Audit Findings vs. Industry Benchmarks**:
  1. `#rulerLane` (timecode ticks + `🥁 808` pins) and `#lyricsLane` (clickable lyric phrase chips) were previously `display: none` in the bottom timeline dock.
  2. The main video monitor lacked a dedicated touch/mouse scrub bar with AI transition markers, and the multicam angle grid lacked quick filters (`All`, `🔒 Synced`, `⚡ Peak`) and visual energy meters.
- **Upgrades Shipped (`app.py`)**:
  1. **Interactive Master Scrubber (`#masterScrubWrap`)**: Runway/DaVinci-style scrub bar directly below the monitor stage with live playhead thumb, cut tick dividers, and glowing purple pins (`✨`) for all 15 AI Morph Transitions. Supports click and touch/mouse drag scrubbing.
  2. **Visible Time Ruler + 808 Pins + Toggleable Lyric Strip & Multicam Tracks**: Enabled `#rulerLane` and `#lyricsLane` in `.timeline-dock` with toolbar toggles (`🎤 Hide/Show Lyrics`, `📊 Show All Camera Tracks`) and a triangular playhead cap (`.playhead-line::before`).
  3. **In-Place Multicam Angle Filtering & Energy Meter Bars**: Added `All | 🔒 Synced | ⚡ Peak` filter pills and `.take-energy-meter-fill` bars inside `getOrCreateAngleCard()` that toggle `card.style.display` in-place without ever destroying `<video>` decoder nodes.
  4. **Keyboard Shortcuts Cheat-Sheet (`⌨️ Keys`)**: Added a quick header popover listing `Space`, `←/→`, `1–9`, `L`, `S`, and `I/O`.

### 1.11 Second & Clip Navigator Timeline + 1-Click Section Preview & Clip Replacement (`app.py`)
- **Problem**:
  1. Packing 80 cuts into a 100%-wide horizontal bar in `#assembledLane` made individual cuts ~1.2% wide at `1x` zoom, making it hard to navigate to a specific second or click individual cuts.
  2. When a user clicked a clip to inspect it, the right-hand preview grid (`#takesGrid`) did not automatically play each available camera's synced section (`[defaultClipIn .. defaultClipIn + winDur]`), and when clicking a replacement clip, `syncProgramMonitor` was called before `useSeamlessMaster` was disabled, causing the main monitor to keep playing the old pre-rendered master MP4 instead of the newly replaced clip.
- **Fix Applied (`app.py`)**:
  1. **Dedicated Second & Clip Timeline (`#clipTimelineNavigatorWrap`) Directly Under `#aiTransitionsBarWrap`**:
     - **Row 1 (`#secondPillsStrip`)**: Clickable second-by-second pills (`0s, 1s, 2s ... 103s`) plus `-1s` / `+1s` step buttons and a direct second jump input (`#quickSecJumpInput`).
     - **Row 2 (`#trillerSegmentStrip`)**: Scrollable storyboard clip cards (`🎬 Cut #1 • 0.0s–1.8s • 🎥 8 clips • IMG_3602.MOV`), auto-scrolling smoothly with the playhead.
  2. **Auto-Previewing Available Clips for the Selected Section (`selectClipFromTimeline`)**:
     - Clicking any clip or second selects that cut, scrolls `#takesScrollContainer` to the top, and seeks + loops every available synced camera's `<video>` in `#takesGrid` over that exact section (`[defaultClipIn .. defaultClipIn + winDur]`, muted) while preserving `angleCardCache` in-place.
  3. **Instant 1-Click Clip Replacement & Hybrid Seamless Playback (`insertClipIntoSelection` & `syncProgramMonitor`)**:
     - Clicking any video card in `#takesGrid` replaces the selected timeline cut with that camera's synced section (`[defaultClipIn .. defaultClipIn + winDur]`), immediately sets `useSeamlessMaster = false` before calling `syncProgramMonitor`, updates `#trillerSegmentStrip` and `#assembledLane`, and loop-plays the newly replaced cut with master song audio.

### 10. Anti-"AI Slop" Studio NLE Design System Overhaul (Frame.io V4 / Resolve Cut Page / FCP Multicam)
- **Problem**: Early web video editor iterations relied on LLM-default "AI slop" visual tropes: neon pink/purple gradients (`#ff2a85` to `#7c3aed`), purple-tinted dark backgrounds (`#13111c`), raw emoji clutter in every button and dropdown, rainbow-bordered floating boxes, and proportional-font timecodes that jittered at 30fps.
- **Root Cause & Fix**:
  1. **Calibrated Rec.709 Neutral Zinc Studio Palette**: Replaced all purple/magenta tints with neutral dark-zinc surfaces (`--bg: #0a0a0c`, `--panel: #111115`, `--panel2: #17171c`, `--panel3: #1f1f26`, `--border: #26262f`) and restricted high-chroma accents to semantic broadcast signals: **Industrial Amber (`#f59e0b`)** for playhead/selected cut/AI FX markers and **Broadcast Tally Emerald (`#10b981`)** for the active `● ON PROGRAM` camera angle and rendered MP4 export state.
  2. **Tabular Monospace Timecodes & Hardware Keycap Chips**: Applied `font-variant-numeric: tabular-nums` and `--mono` (`SF Mono`, `JetBrains Mono`) across all timecodes, cut indices, and duration badges, and replaced raw emojis with clean uppercase hardware labels (`AUDIO MASTER`, `+ CAMERA POOL`, `RE-CUT ANGLES`, `RENDER MP4`) and `<kbd>` shortcut chips.
  3. **Broadcast Multiviewer Camera Wall (`#takesGrid`)**: Restyled `.take-card` as a Final Cut Pro / broadcast multiviewer monitor cell with `● ON PROGRAM [1]` vs `CAM 02 [KEY 2]` tally headers and `SIG` / `SYNC` telemetry while preserving `angleCardCache` in-place `<video>` DOM mutation.

### 11. Music Video VFX & Compositing Engineering Playbook (`clipper/MUSIC_VIDEO_VFX_PLAYBOOK.md`)
- **Reference Case Study**: *diamond\* — "MAN ØN THE MØØN" (Dir. Laughtodabank)* (`01:53`, `23.98 fps`).
- **Living Spec**: See [`clipper/MUSIC_VIDEO_VFX_PLAYBOOK.md`](file:///Users/kabirduggal/Desktop/ANTIGRAV/clipper/MUSIC_VIDEO_VFX_PLAYBOOK.md) for the complete 3-Tier VFX Execution Architecture (`Tier 1`: `FFmpeg` + `OpenCV` deterministic DSP; `Tier 2`: `SAM 2` + `MatAnyone 2` / `RobustVideoMatting` neural video matting & homography tracking; `Tier 3`: `Wan 2.2` / `Kling` / `Flux Fill` prop insertion & texture morphing) and runnable recipes for `VFX-01` through `VFX-10`.

### 12. Wired 10-Family VFX Engine (`vfx_motm_engine.py`), Thematic Plate Adaptation (Bank Vault & Brinks Truck), and Per-Video Project Notes (`projects/BRINKS_PROJECT_NOTES.md`)
- **Problem**:
  1. Raw luminance thresholding for sky replacement (`V < 60`) or foreground rotoscoping (`0.55 * luma`) caused dark sky replacements to bleed into the performer's curly black hair (`V < 40`) and bright doorway portals to bleed into white sweatpants (`V > 135`).
  2. While *MAN ØN THE MØØN* used lunar craters, Saturn, and NASA emblems to match its song title, **Brinks** (`Brinks.m4a`) requires song-specific heist visuals (**Stainless-Steel Bank Vault overflowing with $100 bills & gold bars**, **Armored Brinks Heist Truck with open rear vault doors & raining cash**, and **Raining $100 Bills Night Sky**).
- **Root Cause & Fix (`vfx_motm_engine.py`, `clipper_engine.py`, `projects/BRINKS_PROJECT_NOTES.md`)**:
  1. **Contour-Hugging Performer Hair & Torso Shield (`_detect_performer_shield` & `_extract_subject_alpha`)**:
     - Anchors horizontal/vertical head & torso center `(fcx, fcy, frad)` from central skin pixels (`YCrCb` excluding warm orange wall sconces) and bright white hoodie pixels (`V > 145, S < 75`), stamping a solid `1.0` protective head+hair ellipse (`0.85*frad x 1.02*frad`) and torso trapezoid so sky/portal replacements never eat into curly black hair or white sweatpants.
  2. **Thematic Plate Adaptation for `Brinks` (`clipper/assets/motm/`)**:
     - `brinks_bank_vault_plate.jpg`: Photorealistic stainless-steel circular bank vault door open with towering pallets of $100 bills and gold bullion bars (`motm_lunar_env` on `#09`, `#23` and `motm_doorway_portal` on `#04`).
     - `brinks_truck_heist_plate.jpg`: Photorealistic matte-silver & navy-blue **BRINKS** armored cash-in-transit truck at night with open rear vault doors, duffle bags of cash, and raining $100 bills (`motm_lunar_env` on `#55`, `#68`, `#79` and `motm_doorway_portal` on `#64`).
     - `brinks_money_sky_plate.jpg`: Low-angle night sky filled with raining $100 bills and a giant illuminated stainless-steel bank vault wheel (`motm_sky_cosmos` on `#01`, `#25`, `#31`).
     - `eagle_rgba.png` & `fg_hands_rgba.png`: Real photographic Bald Eagle cutout perched on the performer's shoulder (`motm_eagle_shoulder` on `#28`, `#43`) and oversized optical-blurred foreground hand cutouts (`motm_fg_hands` on `#32`, `#39`).
  3. **Per-Video Living Documentation (`clipper/projects/BRINKS_PROJECT_NOTES.md`)**:
     - Records the complete 10-camera inventory, acoustic sync offsets, all 49 timestamped lyric phrases, and the exact 28 VFX scene assignments + 15 AI morph transitions so any future agent has instant context on the video.
