# [FROM: RED] -> [TO: BLUE, YELLOW] — T010b auth foundation started

Status: blocked on database verification; implementation in progress
Commit/PR: red/auth-foundation, stacked on red/api-scaffold (PR #1)
Contract changes: none; Better Auth owns /auth/* per shared/src/api/auth.ts
Verification: 11 tests passed across API/shared; 1 Postgres integration test skipped; db:check passed
Blockers: no local Docker/Postgres; audit/retention scope review; /me depends on T011
Next owner: BLUE (review and CI db:check gate), KABIR (Docker setup), RED (DB verification and T011)

## Delivered

- `backend/src/db/schema.ts`: Better Auth users, accounts, sessions and
  verifications; users.deleted_at; minimal audit_log. No vault tables yet.
- Drizzle migrations and `db:generate`, `db:check`, `db:migrate` commands.
  Auth-table audit triggers write identifiers/actions in the same transaction;
  passwords, tokens, emails and row payloads are excluded.
- Better Auth 1.7.12 with Drizzle 0.45.4/Postgres, adapter transactions enabled,
  email/password routes at /auth/*, trusted frontend origin and cookies.
- Configuration validation and root .env loading. Existing secrets untouched.
- Real-handler checks for anonymous sessions, malformed signup and rejected
  origins. Separate Postgres test covers signup/login/logout, HttpOnly cookie,
  session revocation and audit rollback. It requires a disposable database
  whose name ends in `_test` and was NOT run against a live DB.
- `backend/README.md` contains exact local setup and verification commands.

## Verified on Node 24.21.0 / pnpm 10.34.7

- Frozen install, shared build, typecheck, oxlint: passed.
- `pnpm test`: 11 passed, 1 skipped (missing TEST_DATABASE_URL).
- API build: passed.
- `pnpm -F api db:check`: passed; checks migration metadata, not live DB drift.
- `pnpm -F api db:generate --name verify-schema`: no schema changes.
- OpenAPI regeneration: no diff; shared contracts unchanged.
- PR #1 scaffold rebased onto main 03626c6; head 9228a74 has green hosted CI.

Live startup for this auth branch was not verified: an execution-policy block
rejected the combined local-env/startup command before it ran. The root .env
was unchanged. Handler checks above did run; database migrations did not.

## Handoff / remaining acceptance

1. Blue: review audit triggers and auth retention. User deletion is disabled;
   Better Auth physically deletes revoked sessions. Please confirm how the
   soft-delete rule applies to auth internals. No domain deletion exists yet.
2. Blue: `pnpm -F api db:check` is ready for the owned CI workflow. A Postgres
   service plus TEST_DATABASE_URL is needed to exercise the integration gate.
3. Kabir: install/start Docker Desktop per TASKS. Red then runs the README's
   postgres startup, migration and disposable-test-DB checks. Passing that test
   clears the database-verification blocker; migration failure blocks acceptance.
4. Red: T011 personal-vault provisioning supplies `/me.personalVaultId`. `/me`
   remains unimplemented, not a fake successful response. T010b stays unchecked.
5. Yellow: continue using shared mocks. This draft is not yet an accepted auth
   integration target. Kabir merges PR #1 first; retarget the stacked draft to
   main after its base lands.
