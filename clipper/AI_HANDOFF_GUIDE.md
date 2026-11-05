# Clipper Studio — AI-to-AI Handoff & Reproduction Blueprint

This document is written specifically for another AI coding agent (or engineer) to immediately understand, reproduce, debug, and extend **Clipper Studio** without having to reverse-engineer the codebase.

---

## 1. System Architecture & Data Contracts (`clipper_engine.py`)

### 1.1 `ClipAnalysis` Dataclass
Each uploaded camera take in `input/clips/` is analyzed once by a background worker thread (`spawn_clip_sync_agent`) and stored in `output/current_project.json` under `project["clips"]`:
```json
{
  "clip_id": "clip_1793837208_1",
  "filename": "DSC_3580.MOV",
  "filepath": "/abs/path/to/clipper/input/clips/DSC_3580.MOV",
  "proxy_url": "/proxies/proxy_clip_1793837208_1_993e0d02b7.mp4",
  "duration": 89.2,
  "width": 1920,
  "height": 1080,
  "fps": 29.97,
  "song_offset_sec": -8.188,
  "sync_confidence": 14.2,
  "is_synced_take": true,
  "usable_start_sec": 8.188,
  "usable_end_sec": 89.2,
  "active_song_start": 0.0,
  "active_song_end": 81.012,
  "avg_motion_energy": 0.64,
  "visual_energy_curve": [0.52, 0.61, ...],
  "color": "#ff2a85",
  "sync_method": "audalign_fingerprint+lipsync_locked"
}
```
- **Crucial Math Definition**:
  `song_offset_sec` is defined such that at any timestamp `t_song` in the master song, the matching frame in `clip` is located at:
  ```python
  t_clip = t_song - clip.song_offset_sec
  ```
  Equivalently:
  ```python
  t_song - t_clip == clip.song_offset_sec
  ```

### 1.2 `EditSegment` Dataclass
Each cut on the timeline (`project["segments"]`) is an `EditSegment`:
```json
{
  "id": "seg_1793845000_0",
  "index": 0,
  "song_start": 0.0,
  "song_end": 1.81,
  "clip_id": "clip_5",
  "clip_filename": "DSC_3643.MOV",
  "clip_filepath": "/abs/path/to/DSC_3643.MOV",
  "proxy_url": "/proxies/proxy_clip_5_6530b01bcd.mp4",
  "clip_in": 113.018,
  "clip_out": 114.828,
  "is_synced": true,
  "effect": "none",
  "beat_energy": 0.82,
  "cut_reason": "lyric+808"
}
```

### 1.3 Three Non-Negotiable Timeline Invariants
Whenever an AI agent modifies `project["segments"]` (re-cutting, splitting, or inserting AI transitions), it **must** preserve all three invariants:
1. **No Timeline Gaps or Overlaps**:
   `segments[i].song_end == segments[i+1].song_start` (within `<= 0.001s`) for all `i`.
2. **1:1 Segment Duration Match**:
   `(seg.song_end - seg.song_start) == (seg.clip_out - seg.clip_in)` (within `<= 0.001s`).
3. **Lip-Sync Lock on Synced Takes**:
   For every base synced segment (`cut_reason != "ai_transition"`), `(seg.song_start - seg.clip_in) == clip.song_offset_sec`.

---

## 2. How Start➜End Frame AI Morph Transitions Work (`/api/create_ai_transition`)

To insert an AI transition of duration `D` (`duration_sec`, e.g. `0.55s` to `1.30s`) between `seg_a = segments[idx]` and `seg_b = segments[idx + 1]`:
1. **Boundary Time**: `cut_t = seg_a.song_end` (which equals `seg_b.song_start`).
2. **Half-Window Carving**:
   - `half_d = round(D / 2.0, 3)`
   - `t_trans_start = round(cut_t - half_d, 3)`
   - `t_trans_end = round(cut_t + half_d, 3)`
   - `clip_a_t = round(seg_a.clip_out - half_d, 3)`
   - `clip_b_t = round(seg_b.clip_in + half_d, 3)`
3. **Boundary Frame Extraction**:
   - Extract `frame_a.png` from `seg_a.clip_filepath` at `clip_a_t`.
   - Extract `frame_b.png` from `seg_b.clip_filepath` at `clip_b_t`.
   - *(Tip for AI Agents: Always inspect `frame_a.png` and `frame_b.png` with vision before writing the `prompt` so the prompt describes the actual objects/gestures in the frames — e.g., a raised finger morphing into a golden saxophone).*
4. **Higgsfield Kling 3.0 Pro Synthesis**:
   - Uploads `frame_a.png` and `frame_b.png` via `higgsfield_client.SyncClient(api_key=hf_key)`.
   - Calls `hf_client.subscribe("kling-video/v3.0/pro/image-to-video", arguments={"prompt": prompt, "image_url": url_a, "end_image_url": url_b, "last_image_url": url_b, "tail_image_url": url_b, "duration": 3})`.
   - Downloads the generated clip and time-warps it with FFmpeg (`setpts={pts_ratio}*PTS,fps=30`) to the exact integer frame count `int(round(actual_dur * 30))`.
5. **Zero-Drift Splice**:
   - `seg_a.song_end = t_trans_start` and `seg_a.clip_out = clip_a_t`
   - `seg_b.song_start = t_trans_end` and `seg_b.clip_in = clip_b_t`
   - Insert `trans_seg` at `idx + 1` with `song_start = t_trans_start`, `song_end = t_trans_end`, `clip_in = 0.0`, `clip_out = actual_dur`, `cut_reason = "ai_transition"`.
6. **Batch Ordering Rule**:
   - When generating multiple transitions in a batch, **always iterate in strictly descending order of `seg_index`** (e.g., `63, 54, 40, 29, 11, 6`) so inserting at `idx + 1` never shifts the index of remaining targets!

---

## 3. REST API Reference (`app.py` on `http://127.0.0.1:5050`)

- `GET /api/project` — Returns `{"project": ProjectState}` including `latest_export_url`.
- `GET /api/agents_status` — Returns live progress of background sync/transition/export workers.
- `POST /api/upload_song` — Form-data `song` upload; runs Whisper lyric transcription + 808 sub-bass detection.
- `POST /api/add_clips` — Form-data `clips` upload; spawns parallel background clip sync agents.
- `POST /api/reslice` — JSON `{"cut_mode": "lyrics_808" | "lyrics_only" | "beat_808" | "2s" | "4s", "preserve_timing": bool}`.
- `POST /api/preview_transition_frames` — JSON `{"seg_index": int, "duration_sec": float}` -> extracts and returns `frame_a_url` and `frame_b_url`.
- `POST /api/create_ai_transition` — JSON `{"seg_index": int, "engine": "higgsfield_kling", "duration_sec": float, "prompt": str}` -> generates and splices AI transition.
- `POST /api/export` — JSON `{"color_grade": "none" | "kodak_2383" | "night_trap" | "bleach_bypass" | "warm_vintage", "quality_mode": "cas_crisp" | "ultra_cinema" | "none"}` -> renders 1080p MP4 via 6x parallel VideoToolbox workers.
