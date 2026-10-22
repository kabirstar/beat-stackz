# [FROM: BRAIN] → [TO: RED] — T016 waveform JSON (ffprobe + audiowaveform in the worker)
2026-10-22
Status: assigned — gated on T030 (Blue clears and merges PR #23). Do not branch `red/waveform` until #23 is on main.
Authorization: 2026-10-22 05:05 Red reports Kabir authorized T016 in Red's chat, conditional on Blue clearing #23. Same standing as T015: BRAIN accepts Red's report; Kabir/Swish can veto in #brain-updates. Invites/shares (T017) are NOT covered by this authorization.
Asked by: Red, via #beat-stackz-hq
  > "Kabir has now explicitly authorized T016 waveforms in my chat once Blue clears PR #23 … I will address findings and then proceed with T016 using the shared waveform contract."
Paths: worker/** (ffprobe + audiowaveform step, Dockerfile deps), backend/** (only `files.waveform` route serving stored peaks, migration if `blobs.duration_ms`/`blobs.waveform` are not there yet)
Depends on: T030 (#23 merged). Rebase onto main first; if Blue's #23 review changes the job/transition shape, build on the merged shape, not 5a3d51c.
Deliverable: after a blob verifies, the worker runs ffprobe (→ `duration_ms`) and BBC `audiowaveform` (8-bit JSON v2) on the same object and stores both on the blob row (ARCHITECTURE §3: `duration_ms INTEGER, waveform JSONB`). `GET /vaults/:vaultId/files/:fileId/waveform` returns exactly `shared/src/api/files.ts` → `files.waveform` ({sampleRate, samplesPerPixel, bits: 8, length, data}); 409 until `ready`; 404 if the blob is not audio (ffprobe finds no audio stream). Non-audio files still become `ready` — waveform failure must not fail verification. Worker Docker image carries ffmpeg + audiowaveform; `docker compose up worker` works. Audit row per transition in the same tx (§6).
Not in this slice: invites, share links, `?token=` on waveform (T017), video/image previews, re-encoding, any new contract field — if you need one, handoff to Blue first.
Verify: `pnpm -F worker test` (or the integration command you name) on Docker Postgres + RustFS with a real short audio fixture: audio → ready + waveform route validates against the shared schema; non-audio → ready + 404 on waveform; processing → 409. Zero skips. State the exact command in your handoff.
Context: shared/src/api/files.ts (waveform route), docs/ARCHITECTURE.md §3 blobs + §4 step 4, docs/adr/0001-upload-integrity.md, comms/brain/T015-verification-worker.md ("keep the stream-once hook so T016 can tap it"), shared/src/mocks (the mock already returns audiowaveform-shaped peaks — match it)
Gate owner: BLUE T030 (comms/brain/T030-review-pr21-pr23.md) — #23 review is item 2 there.
Next owner after done: BLUE (review + merge), then YELLOW inline player against live waveform (T022 follow-up)
