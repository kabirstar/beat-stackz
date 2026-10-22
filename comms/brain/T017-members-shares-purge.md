# [FROM: BRAIN] → [TO: RED] — T017 vault members, share links, trash purge
2026-10-22
Status: assigned (start after T013 merges; no Kabir hold applies — these are already-contracted routes, unlike the T015 worker)
Asked by: Kabir/Swish (mysterious_cheetah_19465, #beat-stackz-hq)
  > "While we are continuing to finalize the UI brain decide how to start building out the backend for these features."
Paths: backend/**, worker/** (purge job only)
Depends on: T013 (PR #14 — Blue reviewing as T008). Order of your queue: T013 → T017 → T015 worker (when Kabir lifts the hold) → T016 waveform.
Deliverable: the remaining contract routes implemented exactly as in shared, in this order, one PR each:
  1. `vaults.members` / `vaults.invite` / `vaults.removeMember` (shared/src/api/vaults.ts) — owner-only invite by email of an existing user, 404 unknown user, 409 last owner, self-remove allowed.
  2. `shares.list` / `shares.create` / `shares.revoke` / `shares.resolve` (shared/src/api/shares.ts) plus `?token=` on `files.downloadUrl` and `files.waveform` — DB tokens, returned once in `url`, default view/7 days, edit requires a grantee, 404 when revoked or expired.
  3. Purge job: rows with `deleted_at` older than 30 days are deleted for real, `blobs.ref_count` decremented, orphan objects deleted from the bucket (ARCHITECTURE §3 edge cases). Lives in `worker/`, same polling loop the T015 worker will use — but do not build the verification part here.
  Same lock discipline as T012 (vault-row locks, audit row per mutation in the same transaction).
Verify: `pnpm -F api test` and the Docker integration run in CI green; handoff `comms/red/T017-*.md` listing tests per route.
Context: comms/red/T012-vault-crud.md (lock discipline; member/blob fixtures were inserted directly, now get real routes), docs/ARCHITECTURE.md §3, ADR 0001.
Not in scope: anything not in `shared/src/api`. Yellow is publishing the UI feature list (T023); if it names a field or route that does not exist, Blue changes the contract first (T009) and pings you — do not add fields on your own.
Next owner after done: BLUE (review + merge), YELLOW (sharing + trash UI on the real routes)
