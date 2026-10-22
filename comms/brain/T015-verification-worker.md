# [FROM: BRAIN] → [TO: RED] — T015 verification worker per ADR 0001
2026-10-22
Status: assigned — hold lifted. 2026-10-22 04:48: Red reports Kabir authorized T015 in Red's chat, conditional on Blue clearing PR #14 (T008). BRAIN accepts Red's report of its own standing instruction; Kabir/Swish can veto in #brain-updates. Gate is now only T008: do not create `red/worker` until Blue's review on #14 is posted and #14 is merged (or Blue says "stack on red/uploads").
History: 2026-10-22 02:14 on hold (Red's standing instruction from Kabir); earlier "go, no sign-off needed" line was wrong.
Asked by: Red, via #beat-stackz-hq
  > "Kabir has now explicitly authorized T015 verification worker in my chat, conditional on Blue clearing PR #14. No further Kabir permission is needed."
Paths: worker/**, backend/** (only what the worker needs: job claim/transition helpers, migration if any)
Depends on: T013 (PR #14, under Blue review as T008). Rebase onto main when #14 merges. If Blue's review changes the jobs/intent shape, rebase before continuing.
Deliverable: exactly your planned entry — a worker process that claims `verify` jobs, streams the object once and hashes it, compares against `claimedSha256`, then does the ADR 0001 transition under the T012 vault-lock discipline: match → `blobs.sha256`/`verified_at` + file `ready` (on UNIQUE conflict: late-dedup — re-point file to the existing verified blob, delete the new object, ref_count fixups); mismatch → delete object, file `failed`, audit `file.verify_failed`. Retain the completion receipt. Handle moved/trashed files. Abort intents past `expires_at`. Runs via `docker compose` `worker` service and `pnpm -F worker dev` locally.
Not in this slice: ffmpeg/ffprobe/audiowaveform. Waveform JSON is the next slice (T016) once verification is merged — keep the stream-once hook so T016 can tap it, but no scaffolding for it now.
Verify: `pnpm -F worker test` (or the integration command you add) on Docker Postgres + RustFS covering: matching hash → ready; mismatched hash → failed + object gone; retry safety (same job twice → one transition); late-dedup onto an existing verified blob; expired intent aborted. Zero skips. State the exact command in your handoff.
Context:
- Spec: comms/blue/T007-upload-integrity.md → "Worker (can be a later slice, T015)"; docs/adr/0001-upload-integrity.md; docs/ARCHITECTURE.md §3 `jobs`, §4 upload flow
- Your own contract for it: comms/red/T013-upload-endpoints.md → "Migration and worker contract"
- Rules: §2 membership is implicit (worker is trusted) but every transition still writes an `audit_log` row in the same transaction (§6); soft delete only (§5); worker never serves bytes
- Jobs claim: `SELECT … FOR UPDATE SKIP LOCKED` is enough; no queue service (AGENTS.md stack)
Next owner after done: BLUE (review + merge), then RED T016 waveform JSON, YELLOW inline player
