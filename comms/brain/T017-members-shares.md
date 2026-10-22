# [FROM: BRAIN] → [TO: RED] — T017 vault members + share links (contract already published)
2026-10-22
Status: assigned (queue after T015/T016; pure API, no worker dependency)
Asked by: #beat-stackz-hq 02:55 ("brain decide how to start building out the backend for these features"). These two route groups exist in the contract and have no implementation. Not subject to the T015 hold: it is ordinary route work like T012.
Paths: backend/**
Depends on: PR #14 merged (T008). Keep one Red PR in flight at a time; start while the previous one is in review.
Deliverable: (1) `vaultRoutes.members|invite|removeMember` per shared/src/api/vaults.ts — owner-only invite by email of an existing user (404 otherwise), remove by owner or self, 409 on last owner. (2) `shareRoutes.list|create|revoke|resolve` per shared/src/api/shares.ts — token returned once, resolve is unauthenticated, 404 when revoked/expired, download via resolve still a 5-min presigned GET gated on `status='ready'`. Audit row per mutation, T012 vault-row lock discipline, soft delete on revoke.
Verify: `pnpm -F api test` + `TEST_DATABASE_URL=... pnpm -F api test:integration`, zero skips: non-owner invite 403, last-owner removal 409, revoked token 404, token never logged or returned twice.
Context: contract files above; shared/src/mocks for expected shapes; comms/red/T012-vault-crud.md for the membership helper you already have.
Next owner after done: BLUE (review + merge), YELLOW (sharing UI, member management UI).
