# [FROM: YELLOW 🟡] → [TO: BLUE 🔵, KABIR, SWISH, BRAIN 🧠, RED 🔴] — T101 Full Context & Scope Session Briefing: Clipper Studio (`clipper/`) & Event Recap Reel Studio (`reel_studio/`)

- **Status**: `done` — Updated with full context from yesterday's build & iteration session for **Blue + Kabir's Scope Session (`2026-11-05`)**
- **Last Updated**: `2026-11-05`
- **Authorized by**: **Kabir** (*"hey i need u to update the handoff doc associated with this on github for blue we are having a scope session so i need you to provide w him all the context from the work we made yday"*)
- **Repository Paths**:
  - `clipper/**` — **Clipper Studio** (Port `5050`): Multi-Angle AI Music Video Sync & Higgsfield Kling 3.0 Pro Morph NLE
  - `reel_studio/**` — **Event Recap Reel Studio** (Port `5055`): Automated Event/Temple Highlight & Scrapbook Polaroid Reel Editor
- **Impact on Beat Stackz Vault (`frontend/`, `backend/`, `shared/`, `worker/`)**: **Zero** — both are standalone Python/Flask + FFmpeg + Librosa + OpenCV + MediaPipe creative video studios.

---

## 🎯 1. Executive Summary for Blue's Scope Session with Kabir

Yesterday we built, iterated on, debugged, and shipped two standalone AI video editing products inside this workspace, and Kabir asked to push both to `beat-stackz` so **Blue, Red, Brain, and Yellow** can collaborate on them and scope out their next phase:

1. **Clipper Studio (`clipper/`, Port `5050`)**:
   - A browser-based **Multi-Camera Music Video NLE & AI Morph Transition Studio** built for artists and directors shooting 5–15 handheld performance takes to a master song (tested and shipped on the **Brinks** music video: `10` synced camera angles, `103.2s` song duration, `80` timeline cuts including **`15` Higgsfield Kling 3.0 Pro Start➜End Frame AI Morph Transitions**).
   - Solves the hardest problems in automated music video editing: **sub-5ms acoustic + visual lip-sync lock**, **808 & lyric-phrase cut pacing**, **zero-drift frame-accurate AI morph splicing**, **zero black flashes in both MP4 exports and browser preview**, and **non-destructive camera angle hot-swapping**.
2. **Event Recap Reel Studio (`reel_studio/`, Port `5055`)**:
   - A browser-based **Cinematic Event & Temple Recap Reel Editor** (tested and shipped on a multi-ceremony Hindu temple event: `11` handheld vertical/horizontal videos from `34s` to `110s` + `3` ceremonial still photos, rendered to a `33.2s` 1080p vertical `9:16` reel).
   - Solves the hardest problems in event/recap reel editing: **filtering out hallway walks, blurry whip-pans, and phone-lowering spikes on 60s–110s raw clips**, enforcing **1 peak highlight per clip in a chronological story arc**, **flashing still photos ON TOP of playing video as tilted 3D Scrapbook Polaroid prints with a camera-shutter flash**, and **mixing `0.70x`/`0.55x` slow-motion & speed-ramps while keeping 100% natural real-time native event audio**.

---

## 🎬 2. Complete Context from Yesterday's Work — Product 1: Clipper Studio (`clipper/`)

### 2.1 End-to-End Pipeline & What We Built
1. **Multi-Window Acoustic + Visual Lip-Sync Engine (`clipper/clipper_engine.py`)**:
   - **Audio Sync (`sync_clip_to_song`)**: Extracts `22050 Hz` audio from the master song (`Brinks.wav`, `103.2s`, `161.5 BPM`) and each raw camera take (`IMG_2811.MOV`–`IMG_2826.MOV`), computes multi-band onset envelopes + chroma cross-correlation across sliding windows, and locks each take's `song_offset_sec` within **`< 5ms` (`0.005s`) tolerance**.
   - **Visual Lip-Sync Verification**: Runs MediaPipe FaceMesh mouth-aspect-ratio (`MAR`) tracking against the vocal envelope to verify when the artist is actively rapping on camera vs. B-roll.
   - **Musical Cut Grid**: Uses `faster-whisper` for word/phrase timestamps (`32` lyric lines) + Librosa sub-bass onset detection (`188` `808` bass hits) + a fast-rap cadence detector to slice the timeline on musical boundaries (`lyrics_808`, `lyrics_only`, `beat_808`, `2s`, `4s`).
   - **Multi-Angle Auto-Director**: Scores every synced camera angle on every cut window by `visual_energy_curve`, face presence, and sharpness, switching angles with an anti-monopoly cap so no single camera dominates.

2. **Higgsfield Kling 3.0 Pro Start➜End Frame AI Morph Transitions (`clipper/higgsfield_mcp_client.py` & `clipper_engine.py`)**:
   - **How It Works**: At any cut boundary between Outgoing Shot A (`seg_a`) and Incoming Shot B (`seg_b`), we extract the exact boundary frames (`Frame A` at `seg_a.clip_out - D/2` and `Frame B` at `seg_b.clip_in + D/2`), upload both frames to Higgsfield Cloud (`kling-video/v3.0/pro/image-to-video`), and prompt a physical morph/camera bridge between the two shots.
   - **3 Batches Generated Yesterday (15 Total AI Morph Transitions in `clipper/output/current_project.json`)**:
     - **Initial 3 + Batch 1 (6 transitions) + Batch 2 (6 transitions) = 15 AI Morphs** distributed across the `103.2s` Brinks video (`80` total segments: `65` base camera cuts + `15` AI transitions).
     - **Varied Musical Durations (`0.55s` to `1.30s`)**: Per Kabir's direction (*"the morphing transitions are best but you can also be creative with them and vary the lengths of the transitions"*), we varied durations based on the rap cadence — fast `0.55s–0.65s` morphs during rapid-fire bars and longer `0.95s–1.30s` morphs on hooks/instrumentals.
     - **Standout Creative Morphs**:
       - **Index Finger ➜ Golden Saxophone Morph** (Kabir's favorite: *"they look great i like the finger that turned into the saxophone transition"*)
       - **Outstretched Hand ➜ Brass Horn / Studio Mic Morph**
       - **Chest Graphic Pull-Back ➜ Night Driveway Car Morph**
       - **Indoor Room Dissolve ➜ Night Football Turf Field Morph**
       - **Liquid Chrome / Neon Portal Subject Morphs**
   - **API Cost Breakdown (Answered for Kabir Yesterday)**:
     - Higgsfield Kling 3.0 Pro (`kling-video/v3.0/pro/image-to-video`) generates a minimum `5.0s` clip per API call at **`~$0.21–$0.42` per transition** (`~$1.26–$2.52` for a batch of 6 transitions; `~$3.50–$6.00` total for all 15 transitions), which we then time-warp (`setpts`) to the exact `0.55s–1.30s` timeline slot.
     - **Zero-Extra-Cost Web Option Built into UI**: Inside the `✨ AI Transition` modal (`clipper/app.py`), we also built **Option 1 ($0 API Cost)** — 1-click download of `Start_Frame_A.png` and `End_Frame_B.png` so a user with a regular `higgsfield.ai` web subscription can generate the clip on the web and upload the downloaded `.mp4` right back into the modal to splice automatically.

3. **Color Grading & Quality Engine Decisions**:
   - **Color Grade Reverted to `"none"` by Default**: Kabir asked to *"undo the color grading for the render but you can keep it as an option in the editor"*. We set `color_grade="none"` (Original Camera Color) as the default for renders and the UI dropdown, while preserving `kodak_2383`, `night_trap`, `bleach_bypass`, and `warm_vintage` as non-destructive selectable options in the header.
   - **DLSS-Style Crispness (`quality_mode="cas_crisp"`)**: Applies 3D temporal low-light denoise (`hqdn3d=1.8:1.4:3.0:2.5`) + Lanczos scaling + AMD FidelityFX Contrast-Adaptive Sharpening (`cas=0.45`) so handheld night shots and AI morph clips share crisp micro-contrast.

4. **Critical Bugs Solved Yesterday in `clipper/`**:
   - **Bug 1 — On-Screen Lyrics & Black Flashing in Music Video**:
     - *User Feedback*: *"why is there black flashing in between the shots and why is the lyrics on screen . remove those also tell me where you added the ai effects and display that in the UI somewhere where i can see that"*
     - *Root Cause & Fix*:
       1. Removed `#liveLyricText` overlay from the video monitor so lyrics never cover the artist's face.
       2. Verified the rendered MP4 (`triller_horizontal_1793849733.mp4`) has **`0` black frames** via `ffmpeg -vf blackdetect=d=0.03:pix_th=0.10`.
       3. Fixed browser monitor black flashing (caused by switching `programVideo.src = seg.proxy_url` 80 times across a song) by adding **Zero-Flash Seamless Master Mode** (`programVideo` plays the continuous rendered `project.latest_export_url` MP4 so `.src` never changes across cuts) with a double-buffered `#programVideoBuffer` fallback when editing un-exported cuts.
       4. Added the **✨ AI Morph Transitions in Timeline (`#aiTransitionsBarWrap`)** badge bar directly under the video monitor showing all 15 AI transitions with Cut #, timestamp, duration, and camera pair (`IMG_2814 -> IMG_2826`), jumping to `song_start - 0.8s` and playing through the transition on click.
   - **Bug 2 — Camera Angle Preview Videos Flashing During Playback**:
     - *User Feedback*: *"also the preview videos keep flashing"*
     - *Root Cause & Fix*: `followPlayheadToActiveCut(t)` called `renderTakePicker()` at every cut boundary (every ~1.2s), which ran `grid.innerHTML = ''` and destroyed/recreated all 10 `<video>` elements 80 times per song! We built **`angleCardCache` (`getOrCreateAngleCard`)** in `clipper/app.py` so the 10 `<video>` DOM elements are created **once** and updated in-place (`.active-take` class, key badge, energy meter bar, and filter visibility) without ever unloading a `<video>` decoder.
   - **Bug 3 — UI Cut Off, Missing Export Button & Mobile Scalability**:
     - *User Feedback*: *"the UI is not navigable i cant find the export button and some is cutt off. it needs to be scalabale and mobile friendly"*
     - *Root Cause & Fix*: Replaced `body { height: 100vh; overflow: hidden }` and fixed `header { height: 50px }` with `min-height: 100vh; overflow-y: auto` and a sticky `flex-wrap: wrap` header; placed **`🎬 Export MP4`** and **`⬇️ Download MP4`** in **both** the top sticky header and the transport bar right below the video monitor; added `<meta name="viewport">` and `@media (max-width: 1024px / 640px)` responsive layouts.
   - **Benchmark NLE Audit Upgrades (`T101b`)**:
     - Added a Runway/DaVinci-style **Interactive Master Scrub Bar (`#masterScrubWrap`)** under the monitor with purple pins (`✨`) at all 15 AI transition timestamps.
     - Unhid the **⏱️ Time Ruler + `🥁 808` Pins (`#rulerLane`)** and **🎤 Clickable Lyric Strip (`#lyricsLane`)**, plus added toolbar toggles (`🎤 Hide/Show Lyrics`, `📊 Show All Camera Tracks`).
     - Added FCPX-style **`All | 🔒 Synced | ⚡ Peak`** angle filter pills + live `.take-energy-meter-fill` bars and a **`⌨️ Keys`** shortcut popover.

---

## 🏛️ 3. Complete Context from Yesterday's Work — Product 2: Event Recap Reel Studio (`reel_studio/`)

### 3.1 Iterative Evolution of `reel_studio/` Yesterday (`v1.0` ➜ `v2.4`)
1. **v1.0 — Multi-Scene Event & Temple Recap Studio (`port 5055`)**:
   - Built `reel_studio/app.py` + `reel_studio/reel_engine.py` with parallel VideoToolbox proxy generation, 4Hz visual action + native audio excitement curves, interactive canvas trimmer (`#trimCanvas`), and 1080p `h264_videotoolbox` export.
2. **v2.0 — Cinematic Slow-Motion, Speed-Ramps & Temple Grades**:
   - *User Feedback*: *"make it more cinematic maybe add some slow motions effects... engaging for someone on instagram scrolling"*
   - Added 5 playback speed modes (`1.0x`, `0.70x` Silky Slow-Mo, `0.55x` Dreamy Slow-Mo, `speed_ramp` `1.35x -> 0.55x`, `1.25x` Fast) and warm film looks (`warm_temple`, `cinematic_film`, `ken_burns_in`).
3. **v2.1 — One-Cut-Per-Clip Policy & Zero-Flash Regular Cuts**:
   - *User Feedback*: *"actually dont reuse clips this time and the transitions are like black screen flashes why arent they regular cuts"*
   - Enforced **1 best highlight cut per video clip** (no clip reuse by default).
   - Removed dip-to-black fades (`transition="none"`, verified `BLACKDETECT_LINES: 0` with FFmpeg `blackdetect`).
   - Built a **Dual-Deck Preloaded HTML5 Video Player (`#previewVideoA` + `#previewVideoB`)** so while Deck A plays Cut $N$, Deck B preloads and seeks Cut $N+1$ in the background, swapping CSS classes in `0ms` with zero black flash.
4. **v2.2 & v2.3 — Temple Photos as 3D Scrapbook Polaroid Pop-Ups Over Playing Video**:
   - *User Feedback*: *"they want to add some photos in as well... can you have the photos flash up like on top of the video sort of like a scrapbook effect"*
   - Instead of static photo slides that interrupt the video timeline, we built `render_scrapbook_photo_overlay_png()` in `reel_engine.py`:
     - Keeps the video clips playing continuously in the background and **flashes the still photo ON TOP of the playing video for a `~1.20s` burst (`between(t, pop_t, pop_end)`)**!
     - Styled with a **100% text-free warm ivory Polaroid paper border**, **translucent gold washi tape** at the top center, **deep 3D Gaussian drop shadow**, **organic tilt (`-3.2°`, `+2.8°`, `-1.8°`)**, and a **`0.10s` warm camera-shutter flash** at `pop_t`.
     - Added full Cut Inspector controls (select photo to pop up over any video cut, frame style, pop-up timing, and `-8°` to `+8°` tilt slider) + live WYSIWYG preview on the stage (`#stageScrapbookWrap`).
5. **Smart Ceremonial Highlight Detection on 11 Videos (`analyze_video_visuals_4hz` & `suggest_highlight_window`)**:
   - When 7 new handheld clips (`34s` to `110.9s`) were added (bringing the project to **11 video clips + 3 temple photos**), naive motion scoring initially picked a blurry hallway walk on `IMG_5292.mov` (`65s`) and a phone-lowering motion spike at the end of `IMG_6384.mov` (`110.9s`).
   - We upgraded `reel_engine.py` with:
     - **Center 70% Crop Laplacian Sharpness + Whip-Pan Penalty (`diff > 13.5` penalized, blur `< 68%` median penalized)**
     - **Start/End Recording Guards** (ignoring the first `8%` and last `6%` of clips `> 15s` where phones are raised/lowered)
     - **Contact-Sheet Visual Verification** across all 11 clips, resulting in a chronological 11-cut ceremonial arc (`33.2s` total, `100%` native event audio enabled, `3` Scrapbook Polaroid flashes on Cuts `#1`, `#5`, and `#9`).
6. **v2.4 — Full UI Audit & CapCut/Reels Responsive Upgrades**:
   - Added `<meta name="viewport">`, sticky `flex-wrap` header, `overflow-y: auto` body, **Mobile/Tablet Workspace Tabs (`📂 Media Bin | 🎬 Stage & Trimmer | 🎛️ Cut Inspector`)**, a **Segmented Full-Reel Progress Bar (`#reelProgressRibbon`)** below the stage, and direct **`🚀 Export MP4` + `⬇️ Download MP4`** buttons in both the header and transport bar.

---

## 🛡️ 4. Non-Negotiable Engineering Invariants (For Blue, Red, Brain & Yellow)

1. **Lip-Sync Lock (`clipper/`)**:
   - Every base synced cut must satisfy `abs((seg.song_start - seg.clip_in) - clip.song_offset_sec) < 0.005`.
   - When inserting an AI transition of duration `D` at boundary `cut_t = seg_a.song_end`, always carve `D/2` from `seg_a.song_end` (`seg_a.clip_out -= D/2`) and `D/2` from `seg_b.song_start` (`seg_b.clip_in += D/2`). Never push downstream segments later in song time.
2. **Descending-Index Batch Splicing (`clipper/`)**:
   - Always iterate target `seg_index` values in **strictly descending order** (`63 -> 54 -> 40 -> 29 -> 11 -> 6`) so splicing at `seg_index + 1` never shifts earlier target indices.
3. **Telescoping Integer Frame Math (`clipper/`)**:
   - Compute `f_start = int(round((seg.song_start - actual_start) * fps))` and `f_end = int(round((seg.song_end - actual_start) * fps))` so segment frame counts telescope to the exact master audio duration (`0.000s` drift).
4. **Zero Black Frames in Exports (`clipper/` & `reel_studio/`)**:
   - Verify every rendered MP4 with:
     ```bash
     ffmpeg -i <output.mp4> -vf "blackdetect=d=0.03:pix_th=0.10" -an -f null -
     ```
     and confirm `0` blackdetect lines before reporting completion.
5. **Zero DOM Destruction on `<video>` Preview Grids (`clipper/app.py`)**:
   - Never run `grid.innerHTML = ''` on `<video>` thumbnail grids during playback; mutate cards in-place via `angleCardCache`.
6. **Zero Text/Ornaments on Scrapbook Polaroid Photos (`reel_studio/`)**:
   - Never render text labels or decorative emblems onto the Polaroid frame in `render_scrapbook_photo_overlay_png()`.

---

## 🧭 5. Key Topics & Options for Today's Scope Session (Blue + Kabir)

Here are the highest-leverage architectural and product questions for **Blue** and **Kabir** to decide on during today's scope session:

### A. Product & Repo Architecture
1. **Standalone Apps vs. Beat Stackz Vault Integration**:
   - *Current State*: `clipper/` (`:5050`) and `reel_studio/` (`:5055`) run locally as standalone Python/Flask apps reading from local `input/` and `output/` folders.
   - *Scope Decision*: Do we keep them as standalone local/studio tools in `clipper/` and `reel_studio/`, or do we want a bridge where a user in **Beat Stackz Vault (`frontend/`)** can select a song in `/mixed` or `/demo` + video takes in a vault folder and click **"Open in Clipper Studio / Reel Studio"** (fetching files via presigned R2/RustFS URLs and saving the exported MP4 back to the vault)?
2. **Execution Target (Local Mac Apple Silicon vs. Hosted Linux Worker)**:
   - *Current State*: Both engines use Apple Silicon `h264_videotoolbox` hardware encoding when available (with automatic `libx264` fallback on Linux/PC).
   - *Scope Decision*: Should `RED` / `BLUE` containerize `clipper/` and `reel_studio/` with `ffmpeg` + `faster-whisper` so they can also run on the Windows PC / Linux VPS, or keep heavy video rendering local-first?

### B. Clipper Studio (`clipper/`) Next-Phase Feature Scope
1. **Non-Destructive AI Transition Cache & Toggle**:
   - Store original pre-carved `[seg_a, seg_b]` bounds + raw `5.0s` Kling `.mp4` path inside segment metadata so users can toggle any AI transition ON/OFF, or change its duration (`0.60s <-> 1.15s`) by re-warping the cached `5.0s` Kling file locally for **`$0` extra API cost**.
2. **Auto-Recommender for Best Morph Boundaries ("Find Top 6 Morph Cuts")**:
   - Score all cut boundaries `[i -> i+1]` by subject pose/framing similarity + visual contrast between `Frame A` and `Frame B`, surfacing the top candidate boundaries in the UI with auto-drafted Kling prompts.
3. **Non-Linear Speed-Ramp Curve on AI Morphs**:
   - Replace linear `setpts` time-warping on the `5.0s` Kling clip with an ease-in / fast-middle / ease-out curve so the start and end of the morph match natural camera motion before accelerating through the morph midpoint.

### C. Event Recap Reel Studio (`reel_studio/`) Next-Phase Feature Scope
1. **Multi-Photo Scrapbook Collage Stack**:
   - Allow 2 or 3 photos to toss/stack sequentially on top of a longer video cut (`Photo A` at `0.9s` tilted `-3.5°`, `Photo B` at `2.1s` tilted `+3.0°`).
2. **Animated Slide-In / Drop-In Physics in FFmpeg Export**:
   - Animate `overlay=x=...:y=...` over the first `0.18s` of `pop_t` so the Polaroid physically slides/drops onto the video frame during the camera-shutter flash.
3. **Beat-Synced Cut & Scrapbook Pop-Up Snapping**:
   - When a background song (e.g., Balaji song or party track) is loaded in `input/music/`, detect beat/tala transients via Librosa and snap both cut boundaries and Scrapbook Polaroid `pop_t` flashes to the exact musical beat.

---

## 📚 6. Complete Documentation Map in This Repo

- **Root Onboarding & Rules**: `AGENTS.md`
- **Clipper Studio (`clipper/`)**:
  - `clipper/AI_HANDOFF_GUIDE.md` — Architecture, JSON schema, API endpoints, and AI transition splicing math
  - `clipper/DOCS_AND_LESSONS.md` — 10 engineering lessons (`1.1`–`1.10`), feature table, and roadmap
  - `clipper/README.md` — Quickstart and environment setup
- **Event Recap Reel Studio (`reel_studio/`)**:
  - `reel_studio/AI_HANDOFF_GUIDE.md` — Architecture, 5-stage pipeline, and invariants
  - `reel_studio/docs/LESSONS_LEARNED.md` — 6 deep lessons (Dual-Deck zero-flash player, 1-cut-per-clip, Scrapbook Polaroid pop-ups, center-crop highlight detection)
  - `reel_studio/docs/FEATURES_AND_ROADMAP.md` — Iteration history (`v1.0`–`v2.4`) and upcoming roadmap
