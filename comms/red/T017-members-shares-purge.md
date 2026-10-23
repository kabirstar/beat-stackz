# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T017 sharing/purge + T018 API image

Status: done (code + local checks; pending PR review)
Commit/PR: red/sharing -> PR #30 https://github.com/kabirstar/beat-stackz/pull/30
Contract changes: none; existing shared routes and response schemas
Verification: 65 tests passed, zero skips (29 API + 22 worker + 6 shared + 8 frontend); Docker PostgreSQL/RustFS
Blockers: Blue owns T034 Compose public/internal S3 endpoint decision/wiring; does not block API/worker review
Next owner: BLUE (review + Compose), YELLOW (live invite/share UI acceptance)

Kabir directly authorized T017 invites/share links/trash purge and the backend
Dockerfile in Red's chat. Branch starts from c76e30f (T016 #26 already merged).
No taxonomy seeding (T026a), mail delivery or other additional scope added.

Implementation:
- backend/src/member-routes.ts: existing-user invites by case-insensitive email,
  owner-only shared-vault changes, duplicate 409, unknown/deleted account 404,
  member self-removal, serialized active last-owner guard. Personal vaults stay
  private; removing membership never removes uploaded files.
- backend/src/share-routes.ts + share-data.ts: file shares stored in migration
  0006, direct view/edit grants and view-only links. CSPRNG 32-byte tokens are
  returned once, stored only as SHA-256, omitted from later listings/audits.
  All mutations/audits are atomic. Only vault editors create/revoke shares;
  a file-edit grantee cannot grant further access or mutate vaults/folders.
- file get/update/trash accept direct grants; folder/cross-vault moves still
  require source/destination vault editor membership. Link tokens only bypass
  session requirements on the exact GET download/waveform routes. Shared
  validation, vault identity, trash, expiry and ready/verified gates remain.
  Public /s/:token resolves the file's current vault, so existing links follow
  moves. New signed GETs last at most five minutes and never outlive share expiry.
  Revoking a share stops new resolutions/URLs; existing presigned GETs can remain
  valid until that bounded expiry, inherent in the existing S3 contract.
- worker/src/purge.ts: files trashed >=30 days release one reference, deleting
  shares/jobs only at hard purge (completion receipts retained until then).
  Skip locked verification jobs to avoid job/vault lock inversion. Empty folders
  are purged leaf-first only if no descendants/files/upload intents reference
  them; live/recent descendants remain. Blob deletion requires locked ref_count=0
  and no actual file references to its key. The orphan row survives failures as
  the retry receipt, including rollback after S3 delete. API dedup takes the same
  blob row lock before attaching a reference. All SQL effects audited atomically.
- Migration 0007 adds partial trash/orphan indexes. Worker reuses its loop and
  checks empty purge at most once/minute: three SELECTs + BEGIN/COMMIT, five
  additional SQL statements/minute versus zero purge work before. Latest local
  empty-purge microbenchmark: 2.40 ms; no production throughput/load claim.
- backend/Dockerfile: Node 24/pnpm 10.34.7, frozen install, build shared/API,
  migration startup then exec compiled server as uid 1000. Explicit COPY paths;
  no .env embedded. No added dependencies, shared changes or root CI edits.

Verified commands (repo root, Docker PostgreSQL/RustFS already running):

```powershell
$env:TEST_DATABASE_URL='postgres://bpackz:bpackz@localhost:5432/bpackz_test'
$env:RUN_STORAGE_INTEGRATION='1'
node --env-file=infra/.env.example --input-type=module -e 'import {spawnSync} from "node:child_process"; process.exit(spawnSync("pnpm", ["-r", "--filter", "!worker", "--if-present", "test"], {shell:true, stdio:"inherit"}).status ?? 1);'
docker build -f worker/Dockerfile --target test -t bpackz-worker:t017-test .
docker run --rm --network infra_default --env-file infra/.env.example -e TEST_DATABASE_URL=postgres://bpackz:bpackz@postgres:5432/bpackz_test -e RUN_STORAGE_INTEGRATION=1 -e S3_ENDPOINT=http://rustfs:9000 bpackz-worker:t017-test
pnpm typecheck
pnpm lint
pnpm -F api db:check
pnpm -F api db:generate # no additional schema changes

docker compose -f infra/docker-compose.yml build api
```

New API checks: roles, origin rejection, personal vault protection, account
lookup, duplicate/last-owner concurrency, token storage/list privacy, actual S3
bytes, waveform schema, expiry capping, revocation, direct-grant restrictions,
move/trash/verification gates, atomic share/member rollback and deleted accounts.
New worker checks: retention/shared references, safe folder descendants, storage
failure, SQL rollback after S3 success, active verify lock, concurrent purgers,
concurrent reference attachment and cancellation. Previous verification/audio
suite still passes with real ffprobe/ffmpeg/audiowaveform.

API image smoke used an isolated temporary database/bucket on infra_default,
explicit in-network DATABASE_URL/S3_ENDPOINT and port 127.0.0.1:4400. Startup
applied migrations; real HTTP auth -> public share -> original S3 download ->
revoke passed inside the container. Host GET /health returned 200; uid was 1000;
SIGTERM exited 0. Temporary container, database, bucket and objects were removed.
Only shared PostgreSQL/RustFS remain running. No main application DB migration
or live application purge daemon was started.

Blue T034: Compose currently passes host .env into API, so localhost DB/S3 cannot
work unchanged inside its container. I used explicit internal overrides for
image verification; these presigned URLs resolve inside Docker, not a host
browser. Decide/confirm the public endpoint arrangement/key, then Red can add
presign-only client support if needed. Do not claim full browser Compose upload
acceptance yet. No frontend/browser flow or hosted R2 validation in this slice.
The new shared Folder.kind/taxonomy PR #29 is separate and unmerged at this checkpoint.
