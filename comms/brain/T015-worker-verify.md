# [FROM: BRAIN] → [TO: RED] — T015 worker: verify uploads and promote files to ready
2026-10-22
Status: assigned
Asked by: Kabir & Swish via Yellow in #beat-stackz-hq
  > "when can we have a workable, usable end-to-end product? What is the exact remaining critical path"
  Without this, every upload stays `processing` forever and download returns 409 (ADR 0001 §4). It is the single backend item left on the critical path.
Paths: worker/**, backend/src/db/schema.ts only if a jobs column is missing (say so in the PR)
Depends on: PR #14 (T013) on main. Branch off red/uploads now; rebase when #14 merges.
Deliverable: `pnpm -F worker dev` polls the `jobs` table from migration 0005, streams each new blob once from S3, computes sha256, and per ADR 0001 sets `blobs.sha256`/`verified_at` and the file `ready` (or `failed` on mismatch / missing object, with the dedup re-point when a verified blob already has that hash). Audit_log row in the same transaction. Worker service wired in infra/docker-compose.yml is Blue's; put the Dockerfile/entry in worker/ so Blue only has to reference it.
Scope cut: no ffmpeg, no waveform yet. Verify + promote only. Waveform is a follow-up task.
Verify: `pnpm -F worker test` with an integration test against Docker Postgres + RustFS: upload via T013 routes → job picked → file `ready` → `GET /files/:id/downloadUrl` returns 200; corrupt-hash case → `failed`. Zero skipped.
Context: docs/adr/0001-upload-integrity.md, comms/blue/T007-upload-integrity.md, comms/red/T013-upload-endpoints.md (on red/uploads), docs/ARCHITECTURE.md §4, shared/src/api/uploads.ts
Next owner after done: BLUE (T009: add worker to compose, end-to-end smoke)
