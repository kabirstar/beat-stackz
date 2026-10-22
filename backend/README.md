# BPACKZ API

The `api` workspace package uses Node 24, Hono, Drizzle and Better Auth.
The API listens on port 4000. Signup provisions a personal vault and owner
membership atomically; authenticated `GET /me` returns the shared user/vault contract.

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
docker compose -f infra/docker-compose.yml up -d postgres rustfs
pnpm -F api db:migrate
pnpm -F api dev
```

Docker Compose is the shared local setup. Database credentials must match
`infra/.env.example`; preserve existing auth and Discord keys when editing `.env`.

## Endpoints

- `GET /health`: `200 {"status":"ok"}` (liveness, not DB readiness).
- `POST /auth/sign-up/email`: Better Auth JSON `{name, email, password}`.
- `POST /auth/sign-in/email`: Better Auth JSON `{email, password}`.
- `GET /auth/get-session`: session/user, or `null` when anonymous.
- `POST /auth/sign-out`: logout; send the session cookie.
- `GET /me`: `{user, personalVaultId}` for the signed-in active owner;
  401 without a valid session, 403 if their personal vault is unavailable.

Browser requests use `credentials: 'include'` from `WEB_ORIGIN`. Better Auth
owns validation and formats under `/auth/*`, per `shared/src/api/auth.ts`.
Unknown API routes and `/me` authorization errors use the shared `ApiError`
schema. `/me` validates its response with `authRoutes.me.response` and disables caching.

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
tokens, emails or row payloads. Per Blue's T005 review, auth audits cover users and
accounts mutations plus session inserts/deletes; refresh and verification plumbing
are excluded. Domain mutations use application transactions and include vault_id.

## PostgreSQL integration check

Use a separate database ending in `_test`. The test applies migrations, creates
uniquely named test users, checks signup/login/logout, HttpOnly cookies and
audit rollback, personal-vault isolation and idempotent backfill, then removes its users. Audit rows and migrations remain in
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

## Signup transaction

Better Auth's after-create hooks run after commit. A small extension to its
Drizzle transaction adapter provisions the personal vault, owner membership and
domain audit rows before signup commits. Session creation failure rolls all of
these back together. A partial unique index on vaults.created_by for personal
vaults enforces one per user. Migration 0003 backfills active existing users and
can repeat the backfill without adding duplicate vaults or audit rows.

## Retired native database

Red's native PostgreSQL 17.11 installation is stopped and retired from the local
workflow. Its files remain under `%LOCALAPPDATA%\BPACKZ\postgres-17.11`; no native
data was deleted or copied into Docker. Use the Compose commands above.

The existing root TEST_DATABASE_URL may still refer to the retired native
instance. The PowerShell test command above overrides it for this process only;
it does not change any other .env key.

Remaining scope: other domain tables/routes, storage and worker integration.
Docker service verification and current test evidence are in Red's handoffs.
