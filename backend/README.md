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
- `GET/POST /vaults`: list memberships or create a shared vault with the caller as owner.
- `GET/PATCH /vaults/:vaultId`: read a vault or rename it (owner only).
- `POST /vaults/:vaultId/folders`: create a folder at a parent or the vault root.
- `GET/PATCH/DELETE /vaults/:vaultId/folders/:folderId`: breadcrumbs, rename/move, recursive soft trash.
- `GET /vaults/:vaultId/children`: folders and paginated file metadata (`folderId`, `limit`, `cursor`).
- `GET/PATCH/DELETE /vaults/:vaultId/files/:fileId`: metadata, rename/move, soft trash.
- `POST /vaults/:vaultId/uploads`: scoped verified dedup or begin an opaque multipart intent.
- `POST /vaults/:vaultId/uploads/:uploadId/sign`: presign selected part PUTs.
- `POST /vaults/:vaultId/uploads/:uploadId/complete`: validate parts, complete once, enqueue verification.
- `DELETE /vaults/:vaultId/uploads/:uploadId?key=...`: abort the caller's intent.
- `GET /vaults/:vaultId/files/:fileId/download`: five-minute URL for a verified ready file.
- `GET /vaults/:vaultId/files/:fileId/waveform`: stored waveform for a verified ready file, or 404 if absent.

Browser requests use `credentials: 'include'` from `WEB_ORIGIN`. Better Auth
owns validation and formats under `/auth/*`, per `shared/src/api/auth.ts`.
Unknown API routes and `/me` authorization errors use the shared `ApiError`
schema. `/me` validates its response with `authRoutes.me.response` and disables caching.

Vault routes validate params, query, bodies and responses with shared schemas.
Invalid fields include `issues: [{path, message}]` for form feedback, without
echoing submitted values.
Active members can read; owners/editors can change folders/files; only owners
can rename vaults. Cross-vault file moves require write access in both vaults.
Mutation requests reject untrusted browser origins. Responses disable caching.

Folder/file updates require the returned `updatedAt` as `ifUpdatedAt`; stale
edits and active name collisions return 409. Root names are unique too, and
files/folders share a namespace. Trashed names may be reused. File pages sort
by id; pass the returned `nextCursor` unchanged. All folders are returned on
each page, as the shared contract specifies.

Tree mutations lock the vault row inside their audit transaction. Cross-vault
moves acquire both locks in id order. This serializes cycle checks, name checks,
and trash/create races. Future uploads and membership changes must follow this
same lock discipline. Soft trash keeps blob references until the later purge job.

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
The integration tests start real HTTP servers on temporary loopback ports.
It verifies credentialed CORS, signup and login session cookies, logout/revocation
and audit rollback against PostgreSQL. Unit checks exercise anonymous sessions,
malformed input and origin rejection without opening a database connection.
The CRUD test also checks permissions, concurrent edits/cycles/collisions,
cross-vault moves, keyset pagination, recursive trash and audit-failure rollback.
Test files run serially because the auth rollback check compares database-wide
counts. Do not run multiple integration commands concurrently against one test DB.
The CRUD test seeds membership/blob/file fixtures directly; it does not claim
that invite, upload or storage APIs are implemented.

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

Remaining scope: member invitations/removal, share-token access, restore/purge
and full-stack browser/Compose integration. There is no vault-delete contract.
Docker service verification and current test evidence are in Red's handoffs.

## Uploads and storage (ADR 0001)

`src/storage.ts` builds an AWS SDK v3 S3 client from the six `S3_*` keys in
`infra/.env.example`. Missing credentials fail explicitly; production requires
HTTPS. The server now passes this client to the upload/download routes.
Copy missing S3 settings from infra/.env.example into the gitignored root .env
without replacing existing auth/Discord/database settings, then run:

```powershell
pnpm -F api storage:setup
pnpm -F api db:migrate
pnpm -F api dev
```

storage:setup creates the bucket if missing and sets a named browser CORS rule
for WEB_ORIGIN, preserving other named rules. The local bucket and CORS were
configured during T013; no application file data was deleted.

Create validates destination/write membership and dedups only against verified
ready blobs referenced by a readable active file. Otherwise it persists a
24-hour intent binding caller, vault, folder, name, size, mime and claimed hash
to a random key. Sign checks ownership/key, expiry and part bounds, with a
five-minute maximum URL lifetime. Complete binds metadata back to the intent,
checks server ListParts sizes/count/ETags, and persists the manifest before S3
completion. It creates a processing file, unverified blob, verify job and audits
atomically. Retrying after S3 success but DB failure recovers from HeadObject;
replaying completion produces the same file rather than another reference/job.

Run the T015 worker with `pnpm -F worker dev`. Until it verifies bytes, new uploads stay
processing and download/waveform return 409. The API never treats the claimed
hash as verified. Worker job payload contains claimedSha256 and the completion
request hash; keep that payload and completed job as the idempotency receipt.
The worker aborts stale intents and removes their rows. The bucket lifecycle
rule installed by storage:setup also aborts orphan multipart uploads after one
day. Start the worker process explicitly; the API does not run jobs itself.

Download/waveform currently require vault-member sessions. Share-token access
will arrive with the sharing slice. Metadata/list responses expose status and
nullable sha256 from the updated shared contract.

Run the disposable local RustFS check from the repository root (PowerShell):

```powershell
$env:RUN_STORAGE_INTEGRATION = '1'
node --env-file=infra/.env.example --test backend/test/storage.integration.test.ts
Remove-Item Env:RUN_STORAGE_INTEGRATION
```

This creates its own uniquely named test bucket, uploads a 64 MiB part and a
final part via presigned URLs, completes, checks byte integrity and Range GET,
verifies anonymous access is denied, checks CORS/ETag exposure, and aborts a
second upload. It cleans up its objects and bucket. It neither modifies the root
`.env` nor modifies the application bucket. Existing environment
variables override `--env-file`; use local RustFS credentials for this check.
`pnpm -F api test:storage` is also available when S3 settings are already present.

Without RUN_STORAGE_INTEGRATION=1, the storage integration test skips. CI enables both PostgreSQL and RustFS integration tests via its service containers. The SDK is set to
calculate request checksums only when required because presigning has no body;
otherwise its default checksum describes an empty payload and RustFS rejects
the browser PUT. This setting does not verify the claimed whole-file SHA-256.

For the full endpoint suite, set TEST_DATABASE_URL to the Docker bpackz_test
database and RUN_STORAGE_INTEGRATION=1, then run `pnpm -F api test:integration`.
The root .env supplies S3 settings. The migration-upgrade test requires CREATEDB
on the disposable PostgreSQL instance and removes its temporary test database.
Current handoff: `comms/red/T013-upload-endpoints.md`.

## Verification and waveform worker (T015/T016)

Run the worker container (or `pnpm -F worker dev` with ffmpeg, ffprobe and
audiowaveform on PATH) alongside the API to verify uploads and promote them from
`processing` to `ready` or `failed`. Setup and retry/cleanup behavior are documented
in [worker/README.md](../worker/README.md). `pnpm -F api storage:setup` now also
preserves existing lifecycle rules while installing a one-day incomplete-multipart
abort rule for `blobs/`. T016 adds duration/peaks on verified audio using the same
S3 read; the existing waveform endpoint serves these to vault members. Non-audio
or unsuccessful waveform processing does not block verified downloads. No
database migration is required for T015/T016. See worker/README.md for Docker
commands, processing limits and retry behavior.
