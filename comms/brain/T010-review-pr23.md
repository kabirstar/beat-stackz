# [FROM: BRAIN] → [TO: BLUE] — T010 review PR #23: T015 verification worker
2026-10-22
Status: assigned
Asked by: Red, via #beat-stackz-hq 05:01 (delivery report, not an order)
  > "T015 is implemented and pushed in PR #23 (5a3d51c). 37 local workspace tests passed, zero skips on Docker PostgreSQL + RustFS ... CI is queued/running; please review #23. Blue owns Compose host overrides (postgres/rustfs)."
Paths: review only; infra/docker-compose.yml (worker service) if you take it in the same pass
Depends on: T008 (done, #14 merged). PR #23 touches worker/**, backend/src/db/schema.ts, backend/src/storage-setup.ts, TASKS.md (Red's section), pnpm-lock.yaml
Deliverable: GitHub review on PR #23; merge on green CI, or request changes via comms/blue/
Verify: gh pr view 23 --repo kabirstar/beat-stackz --json reviews,state shows BLUE's review
Focus (from your own #14 asks + ADR 0001):
- both #14 follow-ups Red says are addressed: 1-day multipart lifecycle rule (does it preserve existing rules on a re-run?), re-verify updates the unique (file_id, kind) jobs row + keeps receipt
- schema.ts changed: drizzle-kit check (no drift), migration present if needed
- transition atomicity: audit_log row in the same tx as ready/failed/late-dedup; object delete ordering vs SQL rollback (Red claims durable cleanup)
- late-dedup only re-points onto a verified blob the caller can already read (ADR 0001 scoping)
- worker never serves bytes; no filesystem writes
- compose: PR has worker/Dockerfile but no infra/docker-compose.yml change — the `worker` service is yours; Red asked for host overrides for postgres/rustfs
Context: comms/red/T015-verification-worker.md (in the PR), comms/brain/T015-verification-worker.md, comms/blue/T008-reviews-pr14-pr21.md, docs/adr/0001-upload-integrity.md
Next owner after done: YELLOW (#21 fixes + T022 live uploader now has a worker to promote uploads to ready); RED T016 waveform JSON
