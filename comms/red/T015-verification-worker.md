# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T015 verification worker

Status: done (implementation and local verification; pending Blue review)
Commit/PR: red/worker -> PR to follow
Contract changes: none; internal jobs.payload gains optional cleanup receipt, no SQL migration
Verification: 37 workspace tests passed, zero skipped (6 shared + 21 API + 10 worker), Docker PostgreSQL/RustFS
Blockers: none for review; Blue owns full Compose wiring, Yellow owns browser integration
Next owner: BLUE (review + merge and T009), YELLOW (T022 live upload/download)

Kabir explicitly authorized T015 in Red's chat. Blue approved the upload API and
merged PR #14, then explicitly cleared T015 in the PR comment and Discord. The
old permission/PR-clearance hold is resolved.

`worker/src/verify.ts` claims verify rows with SKIP LOCKED and streams/hash-checks
S3 bytes without buffering the full object. Hash/size mismatch or missing object
produces failed; verified content produces ready. Late dedup is serialized on the
verified hash, updates references once and removes the redundant object. The file's
current vault is locked for the transition; moving/trashing it during streaming
does not restore it or overwrite its new location. Audit is atomic with SQL changes.

Claim recovery uses the PostgreSQL transaction/row lock: process death releases
the lock and leaves queued work. One connection/transaction remains open per
stream; no long-lived vault lock during network reads. One worker process is the
v1 default. A durable optional cleanup receipt in the existing job payload bridges
the SQL/S3 deletion boundary. It preserves the original completion receipt, and
retries update the unique job row as Blue requested. Retriable storage/database
failures back off 5 seconds to 5 minutes with sanitized error categories.

Expired intents are aborted and prepared objects removed under vault/intent
locks. Blue's other PR #14 follow-up is implemented: storage-setup preserves
existing lifecycle rules and adds a one-day incomplete-multipart abort rule for
blobs/. Its configuration is tested against RustFS; the actual day-later scheduler
execution has not been waited out. The rule is installed in Red's local app bucket.

Tests prove real HTTP upload -> worker -> ready -> signed GET with identical bytes,
bad hash/missing key -> failed, concurrent same-hash dedup after possession,
receipt/ref-count stability, audit rollback, deletion-before-commit recovery,
transient read backoff, killed-process restart, concurrent move/trash, and expiry.
Typecheck/lint/API build/Drizzle check passed; db:generate reports no changes.
Idle poll microbenchmark: about 2.9 ms/pair locally, at most 12 pairs/minute per idle
process, versus zero without the worker. This is not a production load test.

Run instructions and lifecycle details: worker/README.md. Dockerfile builds on
Node 24 and runs as node; a container startup/poll/SIGTERM smoke check exited 0. Blue: wire the existing worker Compose service to
DATABASE_URL with postgres hostname and S3_ENDPOINT=http://rustfs:9000; root .env
uses localhost for host tools. Infra remains untouched. No ffmpeg/waveforms,
sharing features, browser acceptance or hosted R2 verification claimed.
