# Upload verification worker

Node 24 process using the existing API database/storage helpers and installed AWS
SDK/Drizzle dependencies. No queue service, ffmpeg, waveform processing or new env
keys. The API still never reads file bytes.

From the repository root, with the ignored `.env` already configured:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres rustfs
pnpm install
pnpm -F @bpackz/shared build
pnpm -F api db:migrate
pnpm -F api storage:setup
pnpm -F worker dev
```

Run `pnpm -F api dev` in another terminal. A completed upload now starts
`processing`; this worker hashes the S3 stream and compares its length/hash to the
upload intent's saved claim. Matching bytes become `ready`, and the existing
download route returns a five-minute signed GET. Wrong hashes, wrong sizes or
missing objects become `failed`; the user re-uploads. No file bytes are buffered
as a whole or written to disk.

Each process handles one job at a time. It holds a job row with `FOR UPDATE SKIP
LOCKED` during streaming; other processes skip that row. A killed process rolls
back and releases the claim automatically. The row stays `queued` while locked;
there is no committed `running` lease to expire. This uses one database connection
and a transaction for the stream's lifetime. For v1, run one process; high
concurrency/very long uploads would warrant leased claims instead.

After hashing, the worker locks the file's current vault before changing file
metadata. Moved/trashed files retain their location and deletion state. A
transaction advisory lock on the verified hash serializes simultaneous first
uploads. Late dedup only occurs after proving possession of matching bytes;
reference counts change once. Zero-reference superseded blob rows remain for the
future purge pass, with their redundant S3 objects removed.

File/blob/job/audit changes commit together. Cleanup uses an optional internal
`jobs.payload.cleanup` receipt before deleting bytes. On a later pass, deletion
is idempotent and the same job row becomes `done`/`failed`. A crash after S3 delete
but before SQL commit therefore retries cleanup without re-hashing a missing
object. The original `claimedSha256` and `uploadRequestHash` remain intact for
upload-completion replay. Do not delete completed jobs or insert a second verify
row for a file; `(file_id, kind)` is unique.

Storage/transaction failures requeue the existing row with sanitized `last_error`
and exponential backoff from 5 seconds to 5 minutes. Persistent failures remain
queued for operator investigation rather than discarding the file. `attempts`
counts committed verification/cleanup attempts. Failed integrity checks are
terminal after cleanup; re-upload rather than requeueing a now-deleted object.

Each loop also expires one intent: lock vault then intent, abort multipart,
delete any prepared object, then delete/audit the intent. These operations are
safe to retry. `storage:setup` installs an independent one-day bucket lifecycle
abort rule for incomplete `blobs/` multipart uploads, preserving other owners'
rules. This also covers a crash between S3 creation and storing its intent.

When idle the process sleeps 5 seconds: two SELECTs plus transaction BEGIN/COMMIT
per poll, no S3 calls. Baseline without a worker is zero polling; budget with one
worker is at most 12 idle poll pairs/minute (72 SQL statements/minute). The local
Docker database microbenchmark measured about 2.9 ms per empty poll pair; that is
not an end-to-end throughput or production load measurement. SIGINT/SIGTERM aborts
active S3 I/O, rolls back incomplete work, interrupts idle sleep and closes the pool.

## Verification

```powershell
$env:TEST_DATABASE_URL = 'postgres://bpackz:bpackz@localhost:5432/bpackz_test'
$env:RUN_STORAGE_INTEGRATION = '1'
pnpm -F worker test
pnpm -F worker typecheck
```

The test requires a `_test` database URL and a role allowed to create databases.
It creates/drops its own unique database and RustFS bucket. Ten checks include
real HTTP signup/upload/verification/download, mismatch/missing bytes, concurrent
dedup, database rollback after object deletion, transient failure backoff, a killed
child worker, moves/trash during streaming, expiry, and lifecycle configuration.
Without the two test flags it reports a skip, not a verified integration pass.

## Container

```powershell
docker build -f worker/Dockerfile -t bpackz-worker:t015 .
```

The image runs unprivileged and copies only explicit source/package files; `.env`
is not baked in. Blue owns full Compose wiring. Inside the Compose network,
`DATABASE_URL` must use host `postgres`, and `S3_ENDPOINT` must use `http://rustfs:9000`;
host-run API/presigns still need a browser-reachable S3 endpoint. The existing
`worker` Compose service can reference this Dockerfile with those environment
overrides. Full-stack browser acceptance and hosted R2 are not covered by these tests.
