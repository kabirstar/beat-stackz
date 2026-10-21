# Beat Stackz (BPACKZ) — Architecture Plan (draft, 2026-10-21)

Web app where artists and producers each have a private file tree, plus
"shared vaults" that two (later N) people co-own: create folders, upload,
share. Runs on a laptop with zero cloud accounts; moves to a hosted box by
changing env vars. Team roles, repo layout and comms rules: `AGENTS.md`.

## 1. Decision: build custom on a thin stack, don't fork a drive

Surveyed Nextcloud, Seafile, oCIS, Pydio, FileBrowser, Copyparty, Filestash,
Supabase, PocketBase, Directus, Payload.

- Drive clones with real co-owned spaces (Nextcloud/Seafile/oCIS/Pydio) ship a
  whole UI + data model you'd use 10% of, and (except oCIS) carry AGPL +
  trademark strings. Music features (waveforms, versions, timestamped
  comments) would be plumbed around them.
- Light ones (FileBrowser, Copyparty) have no user-created shared spaces.
- PocketBase is the one honest shortcut (MIT, one binary, auth + files + DB).
  Rejected only because uploads proxy through it; multi-GB stem zips should
  go browser → bucket directly. If your files are mostly < 500 MB, PocketBase
  is the lazier choice and the schema below ports to it unchanged.
- oCIS (Apache-2.0, "Spaces" = your vault, Graph API) is the fallback if you
  ever need desktop sync / WebDAV clients on day one.

Our domain model is ~7 tables. That's less code than adapting any of the above.

## 2. Recommended stack

| Layer | Local | Hosted | Why |
|---|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | same | Disjoint folder ownership per agent (see AGENTS.md) |
| Frontend | Vite + React 19 + TS + Tailwind, `frontend` (:5173) | static build served by API or Coolify | Yellow owns it outright; talks to API only via the shared client |
| API | Hono on Node 22 + Drizzle, `backend` (:4000) | same, Docker | Red owns it; 4 upload-signing routes + CRUD; never proxies file bytes |
| Contract | `shared`: zod request/response schemas per route, generated TS client, MSW mocks | same | Blue owns it; the handoff between Yellow and Red. Yellow builds on mocks until routes exist |
| Auth | Better Auth (email+password) mounted in Hono | same, + passkeys/magic link plugins | Library not SaaS; sessions = DB rows + HttpOnly cookie; works offline. Web and API on different origins → CORS with credentials, `WEB_ORIGIN` allowlist |
| DB | Postgres 17 (docker) via Drizzle | Postgres 17 on VPS | One compose line; avoids a SQLite→PG migration later |
| Blobs | RustFS (S3-compatible, Apache-2.0) | Cloudflare R2 (zero egress) | AWS SDK v3 from day one; swap `S3_ENDPOINT` + keys only |
| Uploads | Uppy `@uppy/aws-s3`, presigned multipart, 64 MiB parts | same | Bytes never touch Node; resume via `uploadId` in localStorage |
| Audio | `worker`: ffmpeg + BBC `audiowaveform`, polls a `jobs` table, peaks JSON on blob row | same | wavesurfer.js / peaks.js render; `<audio>` plays a 5-min presigned GET (Range works) |
| Deploy | `docker compose -f infra/docker-compose.yml up` | Hetzner CX23 (~€5.5/mo) + Coolify | Total ≈ €6/mo + R2 storage |

**MinIO is not an option**: maintenance mode Dec 2025, repo archived 2026.
RustFS is the drop-in; Garage is fine too but has no console and no versioning.

**Why a separate SPA + API instead of a Next.js monolith.** A monolith is less
code for one developer. With Yellow (frontend) and Red (backend) as separate
agents on separate machines, a hard boundary that neither can cross matters
more than code volume. The cost is one extra process, CORS, and a shared
contract package; the contract package is also what lets Yellow work on mocks
without waiting for Red.

Rejected: Auth.js (credentials second-class), Clerk/Supabase Auth (hosted
dependency), Next.js monolith (no ownership boundary for a 2-agent split),
tus/tusd (true resume, but a second server; revisit if producers on bad Wi-Fi
complain), SQLite (fine until two writers; PG costs one line now).

## 3. Permission model: vault membership (Google Shared Drive style)

A personal space is just a vault with one member. Everything inside a vault
inherits membership. Per-file/folder sharing is a separate `shares` table.
Authorization is one query, no ancestor walks.

Rejected: per-file ACL rows (row explosion on every upload/move), My-Drive
style per-item inheritance (ancestor walk + override semantics), OpenFGA /
SpiceDB (a second service for one relation type).

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), deleted_at TIMESTAMPTZ
);
-- Better Auth owns: sessions, accounts, verifications (+ passkeys)

CREATE TABLE vaults (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('personal','shared')),
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vault_members (
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  user_id  TEXT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  PRIMARY KEY (vault_id, user_id)
);

CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,   -- NULL = vault root
  name TEXT NOT NULL,
  created_by TEXT REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (vault_id, parent_id, name)
);

CREATE TABLE blobs (                 -- content-addressed, shared across vaults
  sha256 TEXT PRIMARY KEY,
  s3_key TEXT NOT NULL, size BIGINT NOT NULL, mime TEXT,
  duration_ms INTEGER, waveform JSONB,
  ref_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  blob_sha256 TEXT NOT NULL REFERENCES blobs(sha256),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (vault_id, folder_id, name)
);
-- invariant (app-enforced): files.vault_id = folder's vault_id

CREATE TABLE shares (                -- link shares + direct-to-user shares
  id TEXT PRIMARY KEY,
  file_id   TEXT REFERENCES files(id)   ON DELETE CASCADE,
  folder_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
  CHECK ((file_id IS NULL) <> (folder_id IS NULL)),
  grantee_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,  -- NULL = link
  token_hash TEXT UNIQUE,            -- sha256(random 32B); raw token sent once
  role TEXT NOT NULL CHECK (role IN ('view','edit')),
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL REFERENCES users(id),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id TEXT, vault_id TEXT, target_type TEXT, target_id TEXT,
  action TEXT NOT NULL,   -- upload, download, move, rename, trash, share.create, share.revoke, member.add ...
  meta JSONB
);
```

**Can user U write file F?** (swap `IN ('owner','editor')` for any role on read)

```sql
SELECT 1 FROM files f
WHERE f.id = $1 AND f.deleted_at IS NULL AND (
  EXISTS (SELECT 1 FROM vault_members m
          WHERE m.vault_id = f.vault_id AND m.user_id = $2
            AND m.role IN ('owner','editor'))
  OR EXISTS (SELECT 1 FROM shares s
          WHERE s.file_id = f.id AND s.revoked_at IS NULL
            AND (s.expires_at IS NULL OR s.expires_at > now())
            AND (s.grantee_user_id = $2 OR s.token_hash = $3)));
```

Folder tree = adjacency list + recursive CTE (trees are shallow; move is one
UPDATE). ltree/materialized path rejected: makes "move folder" rewrite every
descendant. Folder-level share links need a recursive CTE; skip in v1.

### Edge cases (decided)
- Move personal → vault: `UPDATE files SET vault_id, folder_id`; blob stays;
  existing shares stay (they're on the file, not the space).
- Remove a vault member: cascade the membership row; their uploads stay (vault
  owns them). Block removing the last owner. Soft-delete users so `created_by`
  resolves.
- Trash: `deleted_at`; folder trash sets it on descendants via CTE; purge job
  after 30 days drops rows and decrements `blobs.ref_count`, deleting orphans.
- Concurrent rename: UNIQUE catches collisions; optimistic `WHERE updated_at=?`
  → 409.
- Share links: DB tokens, not HMAC URLs, so they can be listed and revoked.
  Default view, 7-day expiry. Edit links require login.
- Dedup: SHA-256 in-browser (Web Crypto, streaming) during upload; if blob
  exists, just insert the `files` row. Same stem in two vaults is free.

## 4. Upload flow (multi-GB safe)

All four routes are defined in `shared` and implemented in `backend`.

1. Web hashes the file while reading (Web Crypto, streaming), calls
   `POST /uploads` → API checks vault membership, returns `{uploadId, key}`
   from `CreateMultipartUpload`. If the blob sha256 already exists, API
   returns `{dedup: true}` and web skips to step 3.
2. Web PUTs each 64 MiB part to a presigned URL from `POST /uploads/sign`.
   Bucket CORS must allow `PUT` from `WEB_ORIGIN` and expose `ETag`.
3. `POST /uploads/complete` → `CompleteMultipartUpload`, insert `blobs` +
   `files`, insert a `jobs` row; `worker` polls — no queue service.
4. `POST /uploads/abort` on cancel. R2 constraints baked in: fixed part size,
   ≤10k parts → 640 GB ceiling.

## 5. Local vs hosted

`infra/docker-compose.yml`: `postgres:17`, `rustfs/rustfs`, `api`, `web`,
`worker` (ffmpeg + audiowaveform). `.env` keys listed in `AGENTS.md`.

Hosted: same compose minus RustFS; point `S3_*` at R2, `DATABASE_URL` at the
VPS Postgres, `WEB_ORIGIN`/`API_ORIGIN` at real hostnames. Coolify does
git-push deploys. Web is a static build; either serve it from Hono or as a
separate Coolify static site on the same domain to keep cookies first-party.

## 6. What competitors ship (feature backlog, not v1)

Dropbox Replay/Highnote, Byta, Bounce Boss, Tape It, Splice: waveform player,
version stacks per track, timestamped comments, stream-only vs downloadable
links, expiry/password, per-recipient play tracking, send-without-account.
The schema above leaves room: `versions` hangs off `files`, `comments(file_id,
t_ms)` is one table.

## 7. v1 build order

Owner tags per `AGENTS.md`. Yellow works on MSW mocks until Red's routes land.

1. [BLUE] shared schemas (auth, vaults, folders, files, uploads, shares), compose, CI
2. [RED] migrations, Better Auth, personal vault on signup, folder/file CRUD
   [YELLOW] login, vault switcher, folder tree, file list
3. [RED] presigned multipart + presigned GET  [YELLOW] uploader, download
4. [RED] shared vault create/invite/members  [YELLOW] sharing UI
5. [RED] share links (view, expiry, revoke), trash + purge  [YELLOW] link + trash UI
6. [RED] worker + waveform JSON  [YELLOW] inline player
7. [BLUE] hosted deploy: Hetzner + Coolify + R2

## Open questions (answers change the plan)
- Folder taxonomy per artist (stems / masters / artwork / contracts / splits?)
  → might become seeded folders on vault creation, or a `kind` tag on folders.
- Vault = exactly 2 people, or grows? (schema already allows N)
- Typical file sizes → decides PocketBase vs this stack
- In-browser playback needed in v1?
- Self-host for your circle first, or public signups day one? (rate limits,
  email verification, quotas)
