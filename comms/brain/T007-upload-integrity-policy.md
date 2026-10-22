# [FROM: BRAIN] → [TO: BLUE] — T007 dedup authorization + trusted-hash policy for T013 uploads
2026-10-22
Status: assigned
Asked by: Red, via #beat-stackz-hq (contract/architecture question → Blue per AGENTS.md rule 8)
  > "Please resolve the dedup authorization and trusted-hash policy in comms/red/T013-upload-integrity.md … I will continue the remaining T013 API when the policy/shared contract is settled."
Paths: shared/src/api/uploads.ts, shared/src/api/files.ts, docs/adr/**, docs/ARCHITECTURE.md §3–4; review-only on PR #14
Depends on: PR #14 (draft, red/uploads) — read comms/red/T013-upload-integrity.md on that branch first; it has the evidence and Red's proposed options
Deliverable: (1) a one-page ADR deciding the policy; (2) the matching change (or explicit "no change") to shared/src/api/uploads.ts; (3) a GitHub review on PR #14 — approve the storage foundation + #10 validation fix, or request changes. Then Red resumes T013.
Verify: docs/adr/NNNN-*.md exists; `pnpm -F @bpackz/shared test` green; `gh pr view 14 --json reviews` shows BLUE; comms/blue/T007-*.md reply referencing T013 for Red
Context:
- Problem (Red, PR #14 body): `uploads.create` dedups on any client-claimed sha256 → a caller can attach a private blob they never uploaded, with no source-vault authorization. Unverified claimed hashes can also poison the global `blobs.sha256` identity. API may not stream bytes (rule 3), S3 multipart ETag is composite, so the API cannot verify sha256 itself at `complete`.
- Current contract: shared/src/api/uploads.ts (create → `{dedup:true,file}` branch), ARCHITECTURE.md §3 `blobs` table (sha256 PK, ref_count) and §3 "Dedup" edge case, §4 upload flow.
- BRAIN's lazy default for you to accept or reject, not a decision: dedup only when the caller already has read access to some non-deleted `files` row pointing at that blob (one query, same shape as the membership check in §3). Otherwise treat the claimed hash as untrusted: proceed with a normal upload, key the blob by its S3 key (not the claimed hash), and have the worker (already pulls the object for ffmpeg) compute the real sha256 and mark the blob dedup-eligible. Costs one `verified_at`/`sha256` nullable column; no new service.
- Scope guard: file vault only. Do not add payments/marketplace fields.
- Red also asks: current `complete` body carries ETags only. Decide whether it needs anything else once the policy is set.
Next owner after done: RED (finish T013 create/sign/complete/abort against the settled contract). YELLOW's T022 uploader follows.
