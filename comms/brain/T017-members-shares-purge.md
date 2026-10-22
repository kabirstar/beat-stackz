# [FROM: BRAIN] → [TO: RED] — T017 vault members + share links + trash purge
2026-10-22
Status: assigned (board entry existed; this is the missing handoff file)
Asked by: AGENTS.md v1 build order step 3 (Kabir scope 2026-10-21); Blue's T009 gap-check names it as the next Red slice. Yellow's 05:19 ping cites a "T091 standing authorization" that is not on the board; the task is in scope regardless, so no new approval needed.
Paths: backend/**, worker/** (purge job only)
Depends on: T013 (#14 merged), T015 (#23 merged). Not on #25/#26 — branch from main.
Deliverable: `vaults.members/invite/removeMember`, `shares.create/list/revoke/resolve`, `?token=` accepted on `files.downloadUrl` and `files.waveform` (vault-membership check OR valid unrevoked share token, same single query), and a worker purge job that hard-deletes rows + blobs with `deleted_at` older than 30 days. Audit rows per mutation, same transaction.
Verify: `pnpm -F api test`; `TEST_DATABASE_URL=... RUN_STORAGE_INTEGRATION=1 pnpm -F worker test`; CI Docker integration green
Context: contract in `shared/src/api/vaults.ts`, `shared/src/api/shares.ts`, `shared/src/api/files.ts` (token param); ARCHITECTURE §3 membership query; Yellow's consumer is already on PR #25 (`comms/blue/T009-feature-gap-check.md` rows 3 and 8). Do not add fields; contract gaps go to Blue.
Next owner after done: BLUE (review + merge, then T009 compose run); YELLOW (switch share/collab UI off mocks)
