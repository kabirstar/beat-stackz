# Music Video VFX & Compositing Engineering Playbook (`clipper/`)

> **Living Engineering Document** — Last Updated: `2026-11-07`  
> **Reference Study**: *diamond\* — "MAN ØN THE MØØN" (Official Music Video, Dir. Laughtodabank)* (`https://www.youtube.com/watch?v=LQNCppLdVsc`)  
> **Target Runtime**: Apple Silicon (`M-series` MPS / `h264_videotoolbox`) + Python (`OpenCV`, `NumPy`, `PyTorch`) + `FFmpeg 7.x` + Neural Matting (`SAM 2` + `MatAnyone 2` / `RobustVideoMatting`) + Generative I2V (`Wan 2.2` / `Kling` / `Runway`).

---

## 1. Purpose & Architectural Philosophy

Modern underground hip-hop and editorial music videos (exemplified by directors like **Laughtodabank**, **Cole Bennett / Lyrical Lemonade**, **Awge**, and **Gibson Hazard**) do **not** look like generic AI text-to-video generations. Instead, they combine **raw handheld street performance takes** with **tightly masked, tactile compositing**:
- Roto-masked sky replacements wedged between real city architecture
- Roto-clones and oversized foreground hand/body cutouts framing the performer
- Bleach-bypass silver monochrome grades with selective color isolation
- Architectural portals (doorways/windows opening into outer space or lunar landscapes)
- Step-printed motion echoes, 2-frame white exposure flashes, Dutch-angle whip-zooms, and localized prop/texture morphs

This document defines **how to implement each of these 10 effect families inside Clipper Studio (`clipper/clipper_engine.py`)**, ranked by execution tier so every effect can be rendered deterministically without breaking **lip-sync lock** or introducing black frames.

---

## 2. Three-Tier VFX Execution Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   CLIPPER STUDIO 3-TIER VFX ENGINE                         │
├──────────────────────┬──────────────────────────┬──────────────────────────┤
│ TIER 1: DETERMINISTIC│ TIER 2: NEURAL VIDEO     │ TIER 3: GENERATIVE       │
│ DSP & GEOMETRY       │ MATTING & 2.5D COMPOSITE │ INPAINT & PROP MORPH     │
│ (FFmpeg + OpenCV)    │ (SAM 2 + MatAnyone 2)    │ (Wan 2.2 / Kling / I2V)  │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ • Bleach-Bypass LUT  │ • Sky Replacement        │ • Perched Eagle Prop     │
│ • Selective Color    │ • Lunar / Space Cutout   │ • Diamond Chain Crystal  │
│ • Dutch Whip-Zoom    │ • Doorway Portal Mask    │ • Ink / Liquid Glitch    │
│ • 2-Frame Exposure   │ • Multi-Take Roto-Clone  │ • First-Last Frame       │
│ • Motion Echo Trail  │ • Foreground Hand Frame  │   Seamless Bridge        │
├──────────────────────┼──────────────────────────┼──────────────────────────┤
│ Speed: Real-time     │ Speed: ~8–25 fps on MPS  │ Speed: ~15–45s per cut   │
│ Sync: 100% Frame-Lock│ Sync: 100% Frame-Lock    │ Sync: D/2 Symmetric Trim │
└──────────────────────┴──────────────────────────┴──────────────────────────┘
```

### Non-Negotiable Sync & Frame-Integrity Rules
1. **In-Place Layer Effects (`Tier 1` & `Tier 2`)**:
   - Effects applied **over** an existing lip-synced segment (`seg.clip_in .. seg.clip_out`) MUST keep `seg.song_start`, `seg.song_end`, `seg.clip_in`, and `seg.clip_out` unchanged (`abs((seg.song_start - seg.clip_in) - clip.song_offset_sec) < 0.005`).
   - The output frame count MUST equal `round((seg.clip_out - seg.clip_in) * fps)` at `yuv420p`, `24` or `30` fps.
2. **Generative Bridge Transitions (`Tier 3`)**:
   - When inserting a generative transition of duration `D` at cut boundary `cut_t = seg_a.song_end`, always carve `D/2` from `seg_a.clip_out` and `D/2` from `seg_b.clip_in` in **strictly descending `seg_index` order**.

---

## 3. Effect Catalog & Implementation Blueprints (`VFX-01` – `VFX-10`)

---

### `VFX-01`: Bleach-Bypass Silver Monochrome + Selective Color Pop
**Reference Timestamps in *MAN ØN THE MØØN***: `00:00–01:50` (Entire video base grade: chalk-white hoodie & silver-grey Paris limestone, while the red Renault car at `00:00`, blue/red NASA card at `00:12`, yellow eagle beak at `00:05`, and teal street sign at `00:54` retain saturated color).

#### Why It Works
Instead of a flat 100% grayscale filter, a **chemical bleach-bypass** overlays a high-contrast luminance layer onto a partially desaturated color layer (`saturation=0.25..0.35`), while a **chroma key / HSV mask** preserves 100% saturation on chosen accent hues (reds, cyans, yellows).

#### Implementation Blueprint (`FFmpeg filter_complex` — Zero Python Overhead)
```bash
ffmpeg -y -i input_cut.mp4 -filter_complex "\
  [0:v]split=3[base][luma][chroma_key]; \
  [base]eq=saturation=0.22:contrast=1.12:brightness=0.02[desat]; \
  [luma]hue=s=0,curves=m='0/0 0.22/0.14 0.78/0.88 1/1'[silver_bw]; \
  [desat][silver_bw]blend=all_mode=overlay:all_opacity=0.55[bleached]; \
  [chroma_key]eq=saturation=1.35:contrast=1.10[vivid]; \
  [bleached][vivid]blend=all_expr='if(gt(abs(A-B),18),B,A)'[outv]" \
  -map "[outv]" -map 0:a? -c:v h264_videotoolbox -b:v 12M -pix_fmt yuv420p output_bleached.mp4
```

#### OpenCV Selective Hue Preservation (Exact Hue Bands: Red + Cyan/Blue + Gold)
```python
import cv2
import numpy as np

def bleach_bypass_selective_color(frame_bgr: np.ndarray) -> np.ndarray:
    # 1. Silver bleach-bypass base
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    # S-curve contrast on luminance
    lut = np.clip(255.0 * (1.0 / (1.0 + np.exp(-8.0 * (np.arange(256) / 255.0 - 0.5)))), 0, 255).astype(np.uint8)
    silver = cv2.LUT(gray, lut)
    silver_3ch = cv2.cvtColor(silver, cv2.COLOR_GRAY2BGR)
    bleached = cv2.addWeighted(frame_bgr, 0.25, silver_3ch, 0.75, 0)

    # 2. Isolate vivid Red, Yellow/Gold, and Deep Blue/Teal in HSV
    hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
    mask_red1 = cv2.inRange(hsv, (0, 95, 70), (12, 255, 255))
    mask_red2 = cv2.inRange(hsv, (168, 95, 70), (180, 255, 255))
    mask_gold = cv2.inRange(hsv, (15, 110, 90), (35, 255, 255))
    mask_blue = cv2.inRange(hsv, (95, 90, 70), (132, 255, 255))

    vivid_mask = cv2.bitwise_or(cv2.bitwise_or(mask_red1, mask_red2), cv2.bitwise_or(mask_gold, mask_blue))
    vivid_mask = cv2.GaussianBlur(vivid_mask, (9, 9), 0)[:, :, None] / 255.0

    return (bleached * (1.0 - vivid_mask) + frame_bgr * vivid_mask).astype(np.uint8)
```

---

### `VFX-02`: Urban Canyon Sky Replacement & 2.5D Camera-Tracked Starfield
**Reference Timestamps**: `00:01` (starfield between Paris buildings), `00:21` (Saturn, Earth, and galaxies wedged between Haussmann rooftops), `01:18` (starfield + giant hand between buildings).

#### Why Naive Sky Swaps Fail (and How to Do It Right)
1. **Static Sky Bug**: If the handheld camera tilts up or Dutch-rolls (`±15°`) and the replacement space/planet plate stays locked to screen coordinates, the effect looks pasted on.
2. **White Halo Edge Bug**: Overexposed Paris clouds create a bright 2–3px white fringe along building roofs unless the sky alpha mask is **dilated by 2px** and blended with a **dark edge choke + roof luminance wrap**.

#### Recommended Pipeline (`OpenCV Optical Flow Homography` + `SAM 2 / Sky Segmentation`)
1. **Extract Sky Alpha (`M_sky`)**:
   - **Fast Path (Tier 1)**: Upper-frame luminance + low-saturation thresholding (`Y > 185`, `S < 45`) bounded by a flood-fill from the top edge (`y = 0`) so white clothing in the lower frame is never mistaken for sky.
   - **Precision Path (Tier 2)**: Prompt **SAM 2** with positive clicks at `(w//2, 15)` (sky) and negative clicks on the artist/buildings, propagated across all frames.
2. **Track Camera Motion (`cv2.calcOpticalFlowPyrLK` + `cv2.estimateAffinePartial2D`)**:
   - Track corner features (`cv2.goodFeaturesToTrack`) on the **building facades** (`1 - M_sky`).
   - Accumulate the 2D translation + rotation matrix `H_t` from frame `0` to frame `t` and warp the high-resolution space/planet plate (`space_plate_4k.png` or `.mp4`) by `H_t` so Saturn and the stars stay physically anchored behind the buildings!
3. **Choke & Feather Roofline**:
   - Dilate `M_sky` by `2px`, apply `cv2.GaussianBlur(M_sky, (5, 5), 0)`, and multiply building roof edges by `0.85` brightness to eliminate daytime sky spill.

```python
def composite_tracked_sky(frames_bgr: list[np.ndarray], sky_plate_bgr: np.ndarray) -> list[np.ndarray]:
    h, w = frames_bgr[0].shape[:2]
    sky_plate = cv2.resize(sky_plate_bgr, (int(w * 1.4), int(h * 1.4)))
    ox, oy = int(w * 0.2), int(h * 0.2)

    out_frames = []
    prev_gray = None
    cum_M = np.eye(3, dtype=np.float64)

    for frame in frames_bgr:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # 1. Connected-component sky mask seeded from top border
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        raw_sky = ((hsv[:, :, 2] > 180) & (hsv[:, :, 1] < 55)).astype(np.uint8) * 255
        # Keep only regions connected to top row y=0..8
        num_labels, labels = cv2.connectedComponents(raw_sky)
        top_labels = set(np.unique(labels[:8, :])) - {0}
        sky_mask = np.isin(labels, list(top_labels)).astype(np.uint8) * 255

        # 2. Estimate building camera motion (exclude sky)
        building_mask = 255 - sky_mask
        if prev_gray is not None:
            pts0 = cv2.goodFeaturesToTrack(prev_gray, maxCorners=200, qualityLevel=0.01, minDistance=12, mask=building_mask)
            if pts0 is not None and len(pts0) >= 8:
                pts1, st, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, pts0, None)
                good0, good1 = pts0[st == 1], pts1[st == 1]
                if len(good0) >= 6:
                    M_step, _ = cv2.estimateAffinePartial2D(good0, good1, method=cv2.RANSAC)
                    if M_step is not None:
                        M_step3 = np.vstack([M_step, [0, 0, 1]])
                        cum_M = M_step3 @ cum_M

        prev_gray = gray
        # 3. Warp oversized sky plate with accumulated camera transform
        M_warp = cum_M[:2, :].copy()
        M_warp[0, 2] -= ox
        M_warp[1, 2] -= oy
        warped_sky = cv2.warpAffine(sky_plate, M_warp, (w, h), borderMode=cv2.BORDER_REFLECT)

        # 4. Choke & feather mask to remove daytime white roof halo
        kernel = np.ones((3, 3), np.uint8)
        choked_mask = cv2.dilate(sky_mask, kernel, iterations=1)
        alpha = cv2.GaussianBlur(choked_mask, (7, 7), 0)[:, :, None] / 255.0

        comp = (frame * (1.0 - alpha) + warped_sky * alpha).astype(np.uint8)
        out_frames.append(comp)
    return out_frames
```

---

### `VFX-03`: Full-Body Roto Environment Swap (Lunar Surface & Floating in Deep Space)
**Reference Timestamps**: `00:03`, `00:17`, `00:28–00:29`, `00:34`, `00:55`, `01:07–01:08`, `01:22–01:29`.

#### Best-in-Class Stack (`SAM 2` + `MatAnyone 2` / `RobustVideoMatting`)
- **Why not standard `rembg` / `U2Net` frame-by-frame?** Frame-by-frame background removers flicker violently on dreadlocks, white hoodies against grey walls, and cigarette smoke (`01:07`).
- **Recommended 2-Stage Pipeline**:
  1. **Temporal Mask Tracking (`SAM 2` — `sam2.1_hiera_large`)**: Click the performer on Frame `0`; SAM 2 tracks the binary mask across all frames with temporal memory so nearby pedestrians (`00:25`, `01:03`) are ignored.
  2. **Sub-Pixel Alpha Matting (`MatAnyone 2` or `RobustVideoMatting` / `RVM`)**: Refines the SAM 2 mask boundary into a smooth `0.0..1.0` float alpha matte that preserves dreadlock strands, motion-blurred hands, and exhaled smoke (`01:07`).
  3. **Zero-Gravity / Lunar Ground Integration**:
     - For **Deep Space Levitation (`00:03`, `00:55`, `01:28`)**: Apply a slow sinusoidal vertical float (`dy = 6 * sin(2 * pi * t / 2.5)`) + slight radial glow (`gblur=sigma=14` on the alpha channel) behind the performer.
     - For **Lunar Surface Standing Shots (`00:17`, `00:34`, `01:22`)**: Project a stretched, darkened copy of the performer's alpha matte onto the lunar floor plane (`y_foot`) as a hard directional lunar shadow (`opacity=0.75`, `blur=3px`).

---

### `VFX-04`: Architectural Doorway / Window Portal Cutout
**Reference Timestamp**: `00:38` (A Paris building entrance doorway opens directly onto the Moon's surface with Earth floating in the black sky inside the doorframe).

#### How to Implement
1. **Select the Architectural Aperture (`SAM 2` Box/Point Prompt)**:
   - Prompt the dark wooden door / window rectangle on Frame `0` (`M_portal`).
2. **4-Corner Planar Homography Tracking (`cv2.findHomography`)**:
   - Track the 4 corners of the doorframe across the clip so the inner lunar/space scene perspectives-warps with the handheld street camera.
3. **Depth-Parallax Offset**:
   - Translate the inner portal scene at `0.35x` the translation speed of the outer building facade. This creates true **window-into-another-dimension parallax** (as the cameraman steps left, the viewer sees slightly further right inside the Moon portal).

---

### `VFX-05`: Multi-Take Roto-Clone & Synced Double Performance
**Reference Timestamps**: `00:18`, `00:33` (Performer in close-up foreground left while his full-body clone performs in front of the `SPARO` treble-clef shutter in the background right).

#### Why Clipper Studio Is Uniquely Built for This
Because `clipper_engine.py` already computes `song_offset_sec` for every camera take via `audalign` + `faster-whisper`:
1. Given any timeline segment `seg` using `clip_a` (background plate) at `[seg.song_start .. seg.song_end]`, we can automatically query **any second synced take `clip_b`** that covers the exact same song window (`clip_b_in = seg.song_start - clip_b.song_offset_sec`)!
2. Extract the performer's alpha matte `alpha_b` from `clip_b` using `RobustVideoMatting` / `SAM 2`.
3. Composite `clip_b` (foreground clone, scaled or offset horizontally) over `clip_a` (background plate):
   - **Both clones will be 100% lip-synced to the exact same lyric syllable** because both takes are locked to `song_start`!

---

### `VFX-06`: Giant Foreground Hand / Cutout Collage Frame-In
**Reference Timestamps**: `00:28–00:29` (giant hand pointing across the Moon scene), `00:42–00:43` (twin oversized hands framing the performer from bottom-left and bottom-right), `01:18` (giant hand emerging between Paris buildings against the starry sky).

#### Implementation Blueprint
1. **Automated Hand + Forearm Extraction (`MediaPipe Hands` + `SAM 2`)**:
   - Run `MediaPipe Hands` (or `YOLO11-pose` wrist/elbow keypoints) to detect frames where the artist extends a hand toward the lens.
   - Pass the hand keypoints as positive prompts to `SAM 2` to segment the hand + forearm sleeve (`M_hand`).
2. **Oversized Foreground Framing + Optical Defocus**:
   - Scale the segmented hand layer by `1.6x–2.2x`, anchor it to the left/right/bottom frame border, and apply a subtle **camera lens defocus (`cv2.GaussianBlur(hand_rgba, (7, 7), 2.2)`)** so it reads like an out-of-focus foreground element `15 cm` from a wide-angle lens.

---

### `VFX-07`: Motion-Echo / Step-Printing Sneaker & Body Trails
**Reference Timestamp**: `00:39` (Checkerboard Vans sneaker stepping on Paris cobblestones with a fanned, translucent multi-frame ghost trail).

#### Implementation Blueprint (`Subject-Isolated Frame Ring Buffer`)
Standard FFmpeg `tmix` blurs the entire frame (including the cobblestones). To recreate the `00:39` effect cleanly:
1. Maintain a ring buffer of the last `K = 5` frames of the **segmented subject/sneaker `(frame_{t - k}, mask_{t - k})`** sampled at `step = 2` frames (`t-2, t-4, t-6, t-8`).
2. Composite the ghost echoes **behind** the current sharp subject `t` with decaying opacity (`0.45, 0.32, 0.20, 0.10`), then draw the current frame `t` at `100%` opacity on top:

```python
from collections import deque

def render_subject_motion_echo(frames_bgr: list[np.ndarray], masks: list[np.ndarray], echo_steps=(2, 4, 6, 8), weights=(0.45, 0.30, 0.18, 0.10)) -> list[np.ndarray]:
    history = deque(maxlen=max(echo_steps) + 1)
    out = []
    for frame, mask in zip(frames_bgr, masks):
        alpha = (cv2.GaussianBlur(mask, (5, 5), 0)[:, :, None] / 255.0).astype(np.float32)
        history.append((frame.astype(np.float32), alpha))
        canvas = frame.astype(np.float32).copy()

        # Draw older echoes first (behind current subject)
        for step, w_echo in sorted(zip(echo_steps, weights), reverse=True):
            if len(history) > step:
                old_frame, old_alpha = history[-1 - step]
                echo_alpha = old_alpha * w_echo
                canvas = canvas * (1.0 - echo_alpha) + old_frame * echo_alpha

        # Draw current sharp subject on top
        canvas = canvas * (1.0 - alpha) + frame.astype(np.float32) * alpha
        out.append(np.clip(canvas, 0, 255).astype(np.uint8))
    return out
```

---

### `VFX-08`: Liquid / Black-Ink Body Corruption & Datamosh Reveal
**Reference Timestamp**: `00:35` (Glossy black ink/liquid corruption splashing and crawling across the performer's white pants/hoodie next to the green bin).

#### Implementation Blueprint (`Procedural Ink-Bleed Matte` OR `Masked V2V`)
- **Tier 1/2 Procedural Path (Fast & Deterministic)**:
  1. Isolate the performer's white clothing mask (`M_cloth = M_subject & (Luma > 165)`).
  2. Generate an animated multi-octave **Domain-Warped Perlin / Simplex Noise** (or overlay a high-contrast ink-drop video matte `ink_bleed.mp4`) warped by the performer's optical flow (`cv2.calcOpticalFlowFarneback`) so the black liquid sticks to the moving fabric!
  3. Add a specular highlight rim (`cv2.Sobel` on the ink threshold) so the black patches look wet/glossy rather than flat black pixels.
- **Tier 3 Generative Path**:
  - Pass the `0.8s` cut + `M_cloth` mask to **Wan 2.2 V2V Inpainting** or **Runway Gen-4 / Kling** with prompt: *"glossy black ferrofluid ink symbiote splashing and crawling across white fabric, high contrast monochrome cinema"*.

---

### `VFX-09`: Macro Jewelry Crystallization & Surreal Prop Insertion (Perched Bald Eagle)
**Reference Timestamps**: `00:05–00:06` (Bald eagle perched on checkerboard Vans sneaker), `00:47–00:48` (Bald eagle perched on white hoodie forearm), `01:33–01:34` (Macro iced-out starfish pendant expanding into giant raw diamond crystals).

#### Two Proven Production Techniques
1. **Technique A — 2D/3D Anchor-Tracked Cutout / Generative Inpaint (Eagle on Shoe/Arm `00:05`, `00:47`)**:
   - **Why it looks so clean at `00:47`**: The artist holds his right forearm steady for `1.2s`.
   - **Workflow**:
     1. Track the forearm/shoe anchor point `(x_t, y_t, angle_t)` via `cv2.calcOpticalFlowPyrLK` or `SAM 2` part mask.
     2. Either composite a pre-keyed high-res eagle clip (`eagle_alpha.mov`, color-graded with the same bleach-bypass LUT except for its yellow beak/talons) anchored to `(x_t, y_t)` with a contact shadow on the sleeve/sneaker, **OR** extract Frame `0` of the cut, inpaint the perched eagle onto the arm/shoe using **Flux Fill / Nano Banana / SDXL Inpaint**, and animate the `1.2s` shot via **Wan 2.2 / Kling Image-to-Video** locked to the original clip's depth/pose via ControlNet!
2. **Technique B — Macro Jewelry Crystal Expansion (`01:33–01:34`)**:
   - On a macro chain shot (`01:33`), segment the pendant (`SAM 2`) and run an **optical-flow radial dilate + Voronoi facet refraction shader** (Tier 1/2) or a **First-Frame I2V expansion** (Tier 3) where the diamond pendant blooms outward into raw quartz/diamond shards over `0.8s`.

---

### `VFX-10`: 24fps Kinetic Camera Grammar: Dutch-Angle Whip-Zooms, 2-Frame Exposure Flashes & Vector Title Cards
**Reference Timestamps**: `00:02`, `01:04`, `01:13` (1–2 frame white exposure flashes); `00:08–00:09`, `00:22–00:23` (Dutch-angle whip-zooms); `00:12–00:13` (`MOTM — DIRECTED BY LAUGHTODABANK` NASA vector title card); `01:50–01:52` (Director emblem outro).

#### Implementation Blueprint (`FFmpeg filter_complex` Presets)
1. **Dutch-Angle Snap + Punch Zoom (`±14°` Tilt + `1.18x` Ease-Out Zoom)**:
   ```bash
   # Overscale by 1.28x so ±14° rotation never exposes black corners
   ffmpeg -y -i input.mp4 -vf "\
     scale=2458:1382,rotate='14*PI/180*exp(-3*t)':ow=1920:oh=1080:c=none" \
     -c:v h264_videotoolbox -b:v 12M output_dutch.mp4
   ```
2. **2-Frame Overexposure Flash (Zero Black Frames, Pure White Halation)**:
   - Unlike black frames (which look like decoder bugs), a **2-frame white exposure spike** (`eq=brightness=0.85:contrast=2.0` on the first 2 frames of a cut) mimics a 16mm film camera shutter flash (`00:02`, `01:04`, `01:13`):
   ```bash
   ffmpeg -y -i input.mp4 -vf "\
     eq=brightness='if(lt(n,2),0.85*(1-n/2.0),0)':contrast='if(lt(n,2),1.8,1.0)'" \
     -c:v h264_videotoolbox -b:v 12M output_flash.mp4
   ```
3. **Graphic Parody Title Card Cutaway (`00:12–00:13`)**:
   - Render a crisp SVG/PNG title card (`MOTM` / custom song title in bold serif + orbital swoosh on pure `#000000` background with a subtle `2px` chromatic aberration / VHS softness `gblur=sigma=0.8`) and splice it over a `1.0s` drum-drop pause without shifting song sync.

---

## 4. Roadmap for Integrating into `clipper/clipper_engine.py` & Studio UI

| Phase | Module | Description | Compute Tier |
| :--- | :--- | :--- | :--- |
| **Phase 1** | `vfx_color_camera.py` | Add `VFX-01` (Bleach-Bypass + Selective Color Pop) & `VFX-10` (Dutch-Angle Whip-Zoom + 2-Frame White Exposure Flash) directly into `clipper_engine.py` segment renderer. | Tier 1 (`FFmpeg` + `OpenCV`) |
| **Phase 2** | `vfx_roto_compositor.py` | Integrate `SAM 2` / `RobustVideoMatting` mask cache per take so `VFX-02` (Tracked Sky Replacement), `VFX-03` (Space/Lunar Environment Swap), `VFX-05` (Synced Roto-Clone), `VFX-06` (Giant Foreground Hand Frame-In), and `VFX-07` (Sneaker/Body Motion Echo) run automatically on selected cuts. | Tier 2 (`MPS PyTorch` + `OpenCV`) |
| **Phase 3** | `vfx_surreal_props.py` | Add `VFX-04` (Doorway Portal), `VFX-08` (Black-Ink Liquid Corruption), and `VFX-09` (Tracked Prop/Eagle & Macro Jewelry Crystallize) to the Studio UI AI FX Bar alongside our existing morph transitions. | Tier 2 + Tier 3 (`I2V / V2V`) |

---

## 5. How to Update & Extend This Playbook
Whenever a new music video reference is studied or a new VFX operator is benchmarked:
1. Add the reference timestamp, visual mechanics, and failure modes to **Section 3**.
2. Provide both a **Tier 1/2 local deterministic recipe** (`FFmpeg` / `OpenCV` / `SAM 2`) and, where applicable, a **Tier 3 generative recipe**.
3. Verify any rendered output passes the **Zero Black Frames check** (`ffmpeg -i out.mp4 -vf "blackdetect=d=0.03:pix_th=0.10" -an -f null -`) and **Lip-Sync Lock invariant** (`< 5ms` drift).
