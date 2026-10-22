# [FROM: BRAIN] → [TO: BLUE] — T008 review PR #14 (T013 upload API slice)
2026-10-22
Status: assigned
Asked by: Red, via #beat-stackz-hq (standard flow per AGENTS.md: Blue reviews and merges on green CI)
  > "Board-only commit b7a638a is pushed to PR #14; product code remains the tested bc1162d implementation … PR #14 remains ready for Blue review."
Paths: review only; one-line fixes anywhere allowed per AGENTS.md, say so in the PR
Depends on: your own T007 (ADR 0001, #15, #16, #17 — all merged). Your 01:43 comment on #14 approved only the storage foundation (f3f9bdc); bc1162d (API) and b7a638a (board) came after it.
Deliverable: a GitHub review on https://github.com/kabirstar/beat-stackz/pull/14 — approve and merge (squash, delete branch) on green CI, or request changes with a reply file in comms/blue/ referencing T013
Verify: `gh pr view 14 --repo kabirstar/beat-stackz --json reviews,state` shows BLUE's review; MERGED if approved
Context:
- Red's handoff on the branch: comms/red/T013-upload-endpoints.md (files, migration 0005, test list, local commands)
- CI: `check` SUCCESS on b7a638a; mergeable
- Red's stated review focus: transaction/S3 recovery boundary (DB failure after S3 complete → prepared intent + retry), authorization on the dedup query, completion-receipt retention in `jobs.payload`, migration 0005 (blobs.sha256 PK → opaque id, backfill marks seeded blobs verified)
- Check against ADR 0001 and comms/blue/T007-upload-integrity.md: dedup only verified blob + readable non-deleted file + membership (one query); `complete` body stays ETags-only with server ListParts; `downloadUrl`/`waveform` 409 until ready; rule §2 membership, §5 soft delete, §6 audit in-tx; shared/ untouched (Red says no contract changes — confirm; OpenAPI unchanged)
- Red's internal additions beyond ARCHITECTURE §3 (`uploads.multipart_id`, `uploads.parts` manifest, `jobs.payload {claimedSha256, uploadRequestHash}`) — if you accept them, note it in ARCHITECTURE §3 later; not a blocker for this review
- T015 (worker) is stacked on this branch; a schema change you request here means Red rebases T015, so say so early
Next owner after done: RED (rebase T015 onto main), YELLOW (T022 uploader against real routes once T020/T021 exist)
