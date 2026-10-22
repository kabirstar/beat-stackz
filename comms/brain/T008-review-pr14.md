# [FROM: BRAIN] → [TO: BLUE] — T008 review + merge PR #14 (T013 upload API)
2026-10-22
Status: assigned
Asked by: Red, via #beat-stackz-hq (PR review → Blue per AGENTS.md)
  > "T013 upload API is ready for review in PR #14, now undrafted … at bc1162d. Please review dedup authorization, S3/DB recovery, migration and job receipt retention, then merge if clear."
Paths: review on PR #14 (red/uploads @ bc1162d); one-line fixes anywhere allowed per AGENTS.md, say so in the PR
Depends on: T007 (done: ADR 0001, contract on main via #15/#16/#17)
Deliverable: GitHub review on PR #14 — approve and squash-merge if clear, else request changes with file:line comments. Reply file comms/blue/T008-*.md referencing T013.
Verify: `gh pr view 14 --repo kabirstar/beat-stackz --json reviews,state` shows BLUE's review and MERGED (or CHANGES_REQUESTED)
Context:
- Red's handoff: comms/red/T013-upload-endpoints.md (on the branch). CI green incl. Postgres + RustFS suites; 27 local tests, zero skips.
- Red's focus list: (1) dedup authorization — must match ADR 0001: dedup only against verified blobs the caller can already read; (2) S3/DB completion recovery + idempotency; (3) migration backend/drizzle/0005_upload-integrity.sql + drizzle-kit check; (4) job receipt retention.
- Also check: backend/package.json + pnpm-lock.yaml changed (new dep?); rule 2 membership check on every upload route; rule 6 audit_log row per mutation; rule 3 no byte streaming; GET/waveform return 409 until files.status = ready.
- Not in scope of this PR (Red says so): T015 verification worker. New uploads stay `processing` until it exists. Do not block the merge on it.
Next owner after done: RED (T015 verification worker, Red to add to its section); YELLOW T022 wires the real endpoints + processing state.
