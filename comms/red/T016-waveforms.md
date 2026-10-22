# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T016 waveforms

Status: done (implementation/local checks; pending review and CI wiring)
Commit/PR: red/waveform (based on merged #23 + #21)
Contract changes: none; existing blobs fields and waveform route reused, no SQL migration
Verification: 51 workspace tests passed, zero skips (16 worker + 21 API + 6 shared + 8 frontend); Docker PostgreSQL/RustFS + real audio tools
Blockers: Blue-owned CI must run worker tests with audio tools (commands below)
Next owner: BLUE (CI + review), YELLOW (render shared waveform response)

Blue approved #23 and explicitly cleared T016 in its review comment. Kabir's
conditional authorization is satisfied. No review fixes were requested on #23.

The existing S3 verification stream is backpressured into ffprobe and ffmpeg;
BBC audiowaveform consumes mono 8 kHz PCM and returns 8-bit peaks, 256 samples/pixel.
No original bytes on disk, no extra normal-path S3 GET, no API byte proxy. Outputs
are validated, mapped to the shared waveform schema, and committed only after the
hash/size match. Existing canonical peaks survive late dedup; missing peaks are
filled on the canonical blob. Duration uses ffprobe, falling back to decoded
sample count for streaming containers without duration. The endpoint already
validated membership, ready status and stored peaks, so no route rewrite was needed.

Audio failures leave verified files ready/downloadable; the same job retries twice,
then records audio_analysis_failed without invalidating verification. Internal
JSONB payload gains audioAttempts/audioPending; receipt hashes remain untouched.
Crash/SQL rollback replays the existing job; it never changes references twice.
Non-audio is ready with waveform 404. Older verified blobs are not auto-backfilled;
their existing verify jobs can be requeued when peaks are wanted.

The worker image installs official BBC audiowaveform 1.10.2 Debian packages for
TARGETARCH plus Debian's FFmpeg. Startup checks all binaries. Native media tools
are absent from Red's Windows PATH; Docker is the verified execution path.
Limits: first audio stream, mono display peaks, one decoder thread, 6 hours decoded
audio, 10-minute deadline, 8 MiB peaks JSON. Nested file/network protocols are
disabled. Some seek-dependent containers can fail audio analysis while downloads
remain intact. No browser waveform rendering or hosted R2 validation claimed.

Verified local command (repo root; Docker services already up):

```powershell
docker build -f worker/Dockerfile --target test -t bpackz-worker:t016-test .
docker run --rm --network infra_default --env-file infra/.env.example `
  -e TEST_DATABASE_URL=postgres://bpackz:bpackz@postgres:5432/bpackz_test `
  -e RUN_STORAGE_INTEGRATION=1 -e S3_ENDPOINT=http://rustfs:9000 bpackz-worker:t016-test
```

Blue: CI already supplies the service env, but its host lacks these native tools.
Run other workspace tests on the host, then the worker suite in the Docker test
target. Suggested Linux CI commands (same image/tests verified locally; host
network is for CI's localhost service ports):

```sh
pnpm -r --filter '!worker' --if-present test
docker build -f worker/Dockerfile --target test -t bpackz-worker:test .
docker run --rm --network host \
  -e TEST_DATABASE_URL -e RUN_STORAGE_INTEGRATION \
  -e S3_ENDPOINT -e S3_REGION -e S3_BUCKET -e S3_ACCESS_KEY -e S3_SECRET_KEY -e S3_FORCE_PATH_STYLE \
  bpackz-worker:test
```

Tests cover real WAV/MP3/FLAC uploads with misleading generic MIME, one S3 GET,
duration/peaks and unchanged download bytes; processing 409, non-audio 404,
non-member 403, unauthenticated 401, trash 404; false hash never publishes peaks;
tool recovery/capped retries; rollback, cancellation and concurrent canonical
dedup. Prior worker lifecycle/recovery tests also pass. Idle polling remains two
queries every five seconds (no extra poll); local empty-pair microbenchmark was
1.77 ms versus the previous 2.9 ms observation, not a production benchmark.

Tool references: https://github.com/bbc/audiowaveform and https://ffmpeg.org/ffprobe.html.

Additional checks: workspace typecheck and lint passed, Drizzle check passed and
db:generate reported no schema changes. Production worker image built; startup
and SIGTERM shutdown passed (exit 0), with ffprobe 5.1.9 and audiowaveform 1.10.2.
Temporary smoke container removed; no worker process left running by this check.
