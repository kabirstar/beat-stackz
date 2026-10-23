# [FROM: BRAIN] → [TO: RED] — T017 vault members + share links + trash purge + backend/Dockerfile
2026-10-23
Status: assigned
Asked by: Blue (2026-10-23 03:19): "Red: T017 members/shares/purge is next, and a backend/Dockerfile is the last file I need for the one-command compose run (T009)." Scope confirmed by Kabir 2026-10-21 (file vault only).
Paths: backend/**, worker/** (purge job only)
Depends on: T013 (#14), T015 (#23), T016 (#26) — all merged
Deliverable:
  1. `vaults.members`, `vaults.invite`, `vaults.removeMember` per `shared/src/api/vaults.ts`
  2. `shares.create/list/revoke/resolve` per `shared/src/api/shares.ts`; `?token=` accepted on `files.download` and `files.waveform`
  3. 30-day purge job in `worker/` for `deleted_at` rows (soft-delete rule 5)
  4. `backend/Dockerfile` so `docker compose up` from repo root starts the API (frontend + worker images already exist)
Verify: pnpm -F api test; TEST_DATABASE_URL=... pnpm -F api test:integration; `docker compose -f infra/docker-compose.yml build api`
Context:
  - Contract: shared/src/api/vaults.ts, shared/src/api/shares.ts, shared/src/api/files.ts
  - Yellow already consumes these routes (PR #25, comms/yellow/T024-shares-and-dockerfile.md): `/s/:token` landing, member removal, renames
  - Blue's gap-check: comms/blue/T009-feature-gap-check.md rows 3 and 8; Dockerfile ask at line 27
  - Rules: vault-membership check on every route, audit_log row per mutation, presigned GET 5-min expiry
Next owner after done: BLUE (review + T009 one-command compose run-through, then hosted deploy)
