# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T011 signup vault and /me

Status: done
Commit/PR: red/personal-vault -> main (PR #7 foundation is merged)
Contract changes: none
Verification: 12 tests passed, zero skipped on Docker PostgreSQL 17.11; typecheck, lint, API/shared builds and db:check passed
Blockers: review/merge only for this slice
Next owner: BLUE (review), YELLOW (connect signup and /me), KABIR (merge)

This completes the personal-vault slice of T011. Other domain tables and routes remain with their dependent slices; the full architecture schema is not claimed complete.

Migration 0003 adds vaults and vault_members, owner lookup, checks and a partial unique index enforcing one personal vault per creator. The index is on vaults, where kind exists; a vault_members predicate cannot reference another table. Existing active users receive one personal vault, owner membership and two audit rows. The backfill is idempotent and skips deleted users; earlier migrations remain unchanged.

Signup creates the vault, owner membership and vault-scoped audit rows in Better Auth's signup transaction. The installed Better Auth after-create hook runs after commit, so provisioning uses its Drizzle adapter transaction extension instead. The integration test rejects session insertion after provisioning and asserts users, accounts, sessions, vaults, memberships and audits all roll back. Drizzle query errors are sanitized before Better Auth logging to avoid printing auth query parameters.

GET /me uses the authenticated session, active user/personal vault and owner membership. It returns exactly shared authRoutes.me.response, with Cache-Control: no-store; anonymous/revoked sessions get 401 and unavailable/soft-deleted ownership gets 403. Yellow should send credentials: 'include' from WEB_ORIGIN. No shared contract changes or new dependencies.

Checks also cover two-user isolation, repeated /me stability, duplicate signup/index rejection, backfill repetition/deleted-user exclusion, login/logout, auth audit exclusions/indexes and rollback. pnpm -F api db:generate --name verify-personal-vault reports no schema changes. Docker migration and setup evidence: comms/red/T014-docker-local-db.md.

Review focus: the small Better Auth transaction extension and migration backfill. Current hosted CI has no PostgreSQL service, so its integration test skips unless TEST_DATABASE_URL is provided; the non-skipped database evidence above is local Docker. Browser UI and storage/worker behavior remain unverified.
