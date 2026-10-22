# BPACKZ API

The `api` workspace package uses Node 24, Hono, Drizzle and Better Auth.
The API listens on port 4000. T010b is in progress: database-backed auth flows
pass local integration testing; Blue's review and `/me`/personal vaults remain pending.

## Local setup

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm -F @bpackz/shared build
```

Preserve existing root `.env` settings, including Discord credentials. Add
these settings using local DB credentials from `infra/.env.example`; generate
a random secret of at least 32 characters. Never commit `.env`.

```dotenv
DATABASE_URL=postgres://bpackz:bpackz@localhost:5432/bpackz
BETTER_AUTH_SECRET=change-me-to-a-random-secret-at-least-32-characters-long
BETTER_AUTH_URL=http://localhost:4000
WEB_ORIGIN=http://localhost:5173
```

Use one HTTP(S) origin without a path/trailing slash for each origin setting.
Production requires HTTPS. Invalid settings fail startup. `dev`, `start`,
and `db:migrate` load the root `.env`.

With Docker Desktop running:

```sh
docker compose -f infra/docker-compose.yml up -d postgres
pnpm -F api db:migrate
pnpm -F api dev
```

The Docker path remains the shared setup. Red's PC currently uses native
PostgreSQL 17.11 for local verification because Docker/WSL are not installed;
see the PC-specific commands below. Do not run both on port 5432.

## Endpoints

- `GET /health`: `200 {"status":"ok"}` (liveness, not DB readiness).
- `POST /auth/sign-up/email`: Better Auth JSON `{name, email, password}`.
- `POST /auth/sign-in/email`: Better Auth JSON `{email, password}`.
- `GET /auth/get-session`: session/user, or `null` when anonymous.
- `POST /auth/sign-out`: logout; send the session cookie.

Browser requests use `credentials: 'include'` from `WEB_ORIGIN`. Better Auth
owns validation and formats under `/auth/*`, per `shared/src/api/auth.ts`.
Unknown API routes use the shared `ApiError` schema. `/me` awaits personal-vault
provisioning in T011; no placeholder vault ID is returned.

## Checks and migrations

```sh
pnpm -F api typecheck
pnpm -F api test
pnpm -F api build
pnpm -F api db:check
pnpm -F api db:generate --name describe_change
```

`db:check` checks migration metadata consistency, not live database drift.
`db:generate` derives SQL from `src/db/schema.ts`. Commit SQL and metadata;
`db:migrate` applies them. Do not use schema push against existing data.

Auth tables include Better Auth's required fields and `users.deleted_at` for
domain soft deletion. User deletion is not enabled in Better Auth. Session
revocation uses the library's physical session deletion. PostgreSQL triggers
audit auth-table changes in the same transaction, without passwords, hashes,
tokens, emails or row payloads. Blue's review of audit/retention scope is pending.

## PostgreSQL integration check

Use a separate database ending in `_test`. The test applies migrations, creates
uniquely named test users, checks signup/login/logout, HttpOnly cookies and
audit rollback, then removes its user. Audit rows and migrations remain in
the disposable test database. Example in PowerShell after starting Postgres:

```powershell
docker compose -f infra/docker-compose.yml exec postgres createdb -U bpackz bpackz_test
$env:TEST_DATABASE_URL = 'postgres://bpackz:bpackz@localhost:5432/bpackz_test'
pnpm -F api test:integration
```

Without `TEST_DATABASE_URL`, this test reports a skip, not an integration pass.
The integration test starts a real HTTP server on a temporary loopback port.
It verifies credentialed CORS, signup and login session cookies, logout/revocation
and audit rollback against PostgreSQL. Unit checks exercise anonymous sessions,
malformed input and origin rejection without opening a database connection.

## Red's current Windows database

PostgreSQL 17.11 is installed at `%LOCALAPPDATA%\BPACKZ\postgres-17.11\pgsql`.
The adjacent `data` directory holds the cluster; `postgres.log` holds server
logs. It listens only on `127.0.0.1:5432`, uses SCRAM password authentication,
and has `bpackz` and `bpackz_test` databases. Generated credentials and the auth
secret are in the gitignored root `.env`; Discord settings were preserved.
This is a development instance, not a Windows service or automatic startup.

From PowerShell in the repository root, after a reboot:

```powershell
$pgRoot = Join-Path $env:LOCALAPPDATA 'BPACKZ\postgres-17.11'
& "$pgRoot\pgsql\bin\pg_ctl.exe" -D "$pgRoot\data" -l "$pgRoot\postgres.log" -w start
pnpm -F api db:migrate
pnpm -F api test:integration
pnpm -F api dev
```

To stop this database before starting the Docker Postgres service:

```powershell
& "$pgRoot\pgsql\bin\pg_ctl.exe" -D "$pgRoot\data" -m fast -w stop
```

The native database uses its own generated password. When switching to Docker,
update only the relevant database settings to match Compose; preserve other
`.env` keys. Native data is not automatically moved into Docker.

Verified locally: migrations, real HTTP auth integration, compiled server
startup (`/health` and anonymous `/auth/get-session`), 12 tests with no skips,
typecheck, lint, API build and `db:check`. See
`comms/red/T010b-postgres-verification.md` for the checkpoint and limitations.

Pending: Blue's audit-scope review, `/me`/personal vaults, remaining shared
validators/routes, storage and worker integration. Docker is not verified.
