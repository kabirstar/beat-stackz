# Upload verification and waveform worker

Node 24 process using the existing API database/storage helpers and installed AWS
SDK/Drizzle dependencies. Requires ffmpeg/ffprobe and BBC audiowaveform on PATH;
the Docker image supplies FFmpeg 5.1 (Debian security updates) and audiowaveform
1.10.2. Startup fails clearly if a tool is missing. No new env keys or queue
service. The API still never reads file bytes.

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

The same S3 stream feeds ffprobe and ffmpeg with backpressure while being hashed.
ffmpeg decodes the first audio stream to mono 8 kHz signed 16-bit PCM in a pipe;
BBC audiowaveform produces 8-bit JSON v2 at 256 samples per pixel (31.25 pairs/s).
Original bytes are never replaced or re-encoded in storage. Only after successful
verification do duration and peaks commit on the canonical blob, together with
the verification audit. ffprobe supplies duration where available; otherwise the
decoded sample count supplies it. File extension and client MIME are not trusted.
The existing waveform route returns the shared camelCase response: 409 before
verification, 404 without peaks, 403 for non-members, 401 without a session.

Non-audio stays ready without peaks. Audio-tool errors also preserve verified
downloads and retry the same job twice (10 s then 20 s); after three failed audio
attempts the job is done with `last_error=audio_analysis_failed`. Receipt and refs
remain intact. Requeue the existing verify job after fixing the tool/format, never
insert a second one. Already-verified files without peaks can likewise be requeued;
this release does not scan/backfill all older files. Integrity failures never save
peaks. Late dedup retains existing canonical peaks or fills them if absent.

All media subprocesses run without a shell, with only the pipe protocol enabled
(no nested file/network URLs), one ffmpeg decoding thread, a ten-minute processing
deadline, six-hour decoded-audio ceiling and 8 MiB JSON output cap. Reaching a limit
leaves the original downloadable without peaks after the bounded retries. Formats
requiring seekable input may not yield peaks; WAV, MP3 and FLAC are integration-tested.
Shutdown kills active children and rolls back the current transaction.

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
docker build -f worker/Dockerfile --target test -t bpackz-worker:t016-test .
docker run --rm --network infra_default --env-file infra/.env.example `
  -e TEST_DATABASE_URL=postgres://bpackz:bpackz@postgres:5432/bpackz_test `
  -e RUN_STORAGE_INTEGRATION=1 -e S3_ENDPOINT=http://rustfs:9000 bpackz-worker:t016-test
pnpm -F worker typecheck
```

The test requires a `_test` database URL and a role allowed to create databases.
It creates/drops its own unique database and RustFS bucket. Sixteen checks include
real HTTP signup/upload/verification/download, mismatch/missing bytes, concurrent
dedup, database rollback after object deletion, transient failure backoff, a killed
child worker, moves/trash during streaming, expiry, and lifecycle configuration;
real WAV/MP3/FLAC peaks and duration, one S3 GET, authenticated waveform reads,
non-audio, audio-tool failure recovery/cap, metadata rollback, cancellation and
canonical peaks after concurrent dedup. No skips with the command above. For host
tests, install all three tools and set the two test flags plus S3 env, then run
`pnpm -F worker test`. The Docker test target contains test fixtures/migrations;
the default production target does not.
Without the two test flags it reports a skip, not a verified integration pass.

## Container

```powershell
docker build -f worker/Dockerfile -t bpackz-worker:t016 .
docker run --rm --network infra_default --env-file .env `
  -e DATABASE_URL=postgres://bpackz:bpackz@postgres:5432/bpackz `
  -e S3_ENDPOINT=http://rustfs:9000 bpackz-worker:t016
```

The image runs unprivileged and copies only explicit source/package files; `.env`
is not baked in. Blue owns full Compose wiring. Inside the Compose network,
`DATABASE_URL` must use host `postgres`, and `S3_ENDPOINT` must use `http://rustfs:9000`;
host-run API/presigns still need a browser-reachable S3 endpoint. The existing
`worker` Compose service can reference this Dockerfile with those environment
overrides. Full-stack browser acceptance and hosted R2 are not covered by these tests.
