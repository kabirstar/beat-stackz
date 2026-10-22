# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T010b Postgres/auth verification

Status: done for local auth verification; T010b remains in progress
Commit/PR: red/auth-foundation — https://github.com/kabirstar/beat-stackz/pull/4 (draft, stacked on PR #1)
Contract changes: none
Verification: 12 tests passed, zero skipped with TEST_DATABASE_URL; migration/build/typecheck/lint/db:check passed
Blockers: Blue review/audit-retention decision; /me requires T011 personal vault provisioning
Next owner: BLUE (review and CI database gate), RED (T011), KABIR (merge when accepted)

## Review status

Checked Discord and PR #4 comments. No PR #4 review findings were posted at this
checkpoint. Requested Blue's review in Discord; no approval is inferred.
Blue's BRAIN coordinator introduction was read. This file is the current status
for BRAIN and supersedes the missing-database/live-startup blockers in the
earlier `T010b-auth-foundation.md` handoff.

## Local database now running

- Native PostgreSQL 17.11 Windows x64, downloaded through PostgreSQL.org's EDB
  binaries link. Archive SHA-256 matched EDB's published checksum:
  `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`.
- Install: `C:\Users\Kabir\AppData\Local\BPACKZ\postgres-17.11\pgsql`.
  Data: adjacent `data`; log: adjacent `postgres.log`.
- Loopback-only `127.0.0.1:5432`, SCRAM password authentication. Databases:
  `bpackz` and isolated `bpackz_test`. No existing data was replaced.
- Root gitignored `.env` now has generated DB credentials/auth secret and local
  origins; original Discord settings preserved. Temporary init password file
  removed. No credentials are committed or printed.
- Docker/WSL are still absent. This native instance unblocks local tests;
  Compose/infra were not modified. No Windows service/autostart was installed.
- `backend/README.md` has restart/stop and test commands. Stop native Postgres
  before using Docker's port 5432; their credentials/data are separate.

## Verification and changes

- Applied both Drizzle migrations to the development and test databases.
- Updated the existing integration test to make real HTTP requests through Hono
  on a temporary loopback port. No API implementation changes were necessary.
- Signup succeeds with shared User shape, HttpOnly cookies and credentialed
  CORS; cookie session lookup succeeds; wrong password is rejected; logout
  revokes the old cookie; login issues a working new session cookie.
- Auth mutations produce audit rows; audit rows roll back with failed mutation.
- `pnpm -F api test:integration`: passed with zero skips against PostgreSQL 17.11.
- `pnpm test` with TEST_DATABASE_URL loaded: 7 API + 5 shared tests passed,
  zero skipped. Expected invalid-password/origin logs are negative-path checks.
- `pnpm typecheck`, `pnpm lint`, `pnpm -F api build`, `pnpm -F api db:check`:
  passed. db:check is migration metadata validation, not a live drift detector.
- Compiled server launched on port 4000: GET /health -> 200, anonymous
  GET /auth/get-session -> 200/null. Smoke-test API stopped; Postgres left running.

The earlier execution-policy rejection did not recur for this authorized setup;
live startup is now verified. CI still has no Postgres service and will skip the
DB test until Blue adds TEST_DATABASE_URL plus a disposable database. Blue also
owns adding the db:check CI step. No browser UI, Docker deployment, vault CRUD,
storage or worker verification is claimed. PR #4 remains draft pending review
and its documented /me/T011 dependency.
