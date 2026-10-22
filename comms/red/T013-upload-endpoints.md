# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T013 upload endpoints ready for review

Status: done (API slice; verification worker remains T015)
Commit/PR: red/uploads -> PR #14
Contract changes: implements Blue's merged ADR 0001 / PR #15 exactly; none authored by Red
Verification: 27 local tests passed, zero skipped (21 backend + 6 shared), PostgreSQL 17.11 + RustFS
Blockers: none for API review; new uploads remain processing until T015 worker runs
Next owner: BLUE (review/merge), YELLOW (uploader), RED (T015 when assigned)

Blue cleared the approach in comms/blue/T007-upload-integrity.md and PR #14's review. The original integrity question is resolved. This PR now includes the API on top of its approved storage/validation foundation.

## Behavior and files

- backend/src/upload-routes.ts: create/sign/complete/abort, five-minute GET signing and waveform readiness gate. Shared schemas validate every request/response. All routes reuse the existing session/origin middleware and membership/destination helpers extracted into vault-data.ts.
- Create dedups only verified ready blobs behind an active file/vault readable by the caller; size must match trusted metadata. Otherwise an opaque intent/key is bound to caller, vault, destination, name, size, mime and claimed hash. No hash-derived keys or global private-blob reuse.
- Sign enforces intent ownership, key, expiry, unique/in-range parts, with max five-minute presigns. Intent lifetime is 24 hours; expired intents can still be explicitly aborted.
- Complete verifies server ListParts count, exact 64 MiB non-final parts and final size, consecutive numbers and ETags. It persists that checked manifest before S3 completion. File/blob/job/audit writes and intent deletion are atomic. Files start processing and blobs have NULL sha256/verified_at.
- Database failure after S3 success leaves a recoverable prepared intent. Retry uses HeadObject length + server-set upload-id metadata, then commits the file/job once. A concurrent or later replay checks the retained job receipt and returns the same file. Metadata/manifest changes are rejected.
- Abort handles active multipart uploads and a completed object whose DB transaction failed, then deletes intent and audits. Create compensates with AbortMultipartUpload if its DB transaction fails.
- Downloads require current membership, ready status and verified_at. URL expiry is 300 seconds; filenames are encoded in Content-Disposition. Waveform is 409 before ready, 404 if absent. Share tokens are not enabled until the sharing slice.

## Migration and worker contract

0005 adds opaque blob IDs, nullable unique verified hashes, files.blob_id/status, upload intents and jobs. Existing pre-upload seeded blobs are marked verified per Blue's migration instruction. Their object keys, file references and ref counts are preserved; a real old-schema-to-new-schema test checks this in an isolated database. Prior migrations were not edited.

Internal intent fields beyond the architecture sketch: multipart_id (real S3 handle) and parts (durable server-checked manifest). File/blob IDs reuse the intent UUID. Jobs have payload `{claimedSha256, uploadRequestHash}` so the worker retains the claim after deleting the intent, and completion has an idempotency receipt. Keep the completed job/payload; deleting a file cascades its job.

T015 should claim verify jobs, stream/hash object bytes, compare against claimedSha256, then perform the ADR ready/failed/late-dedup transition under the same vault-lock discipline. It must update ref counts and audits, retain the receipt payload, and handle moved/trashed files. It also owns expired-intent cleanup. No worker loop, ffmpeg or audiowaveform processing is implemented here. If compensating S3 abort fails, a sanitized error is logged; bucket lifecycle cleanup is also needed for orphan multipart handles.

## Evidence and local setup

Real HTTP + Docker tests cover anonymous/viewer/outsider denial; another editor cannot operate someone else's intent; forged keys, expired intents and invalid/duplicate parts; changed completion metadata; bad sizes/ETags; single-part and 64 MiB+tail multipart; forced DB audit failure after S3 completion; concurrent retries with one file/ref/job; private-known-hash dedup denial; verified readable dedup; processing/failed download denial; ready presigned GET and missing waveform; deleted destinations; and abort.

Typecheck, lint, API build, db:check passed; db:generate reports no changes; generated OpenAPI is unchanged. Blue added PostgreSQL and RustFS services in PR #17; both integration suites run in CI after rebasing onto that change.

Added only missing S3 keys to Red's ignored root .env from the existing infra/.env.example, preserving all existing bytes/credentials. `pnpm -F api storage:setup` created the local application bucket and a named WEB_ORIGIN CORS rule, preserving other rules. `pnpm -F api db:migrate` applied 0005 to Docker's development DB. No secrets are committed.

```powershell
pnpm -F api storage:setup
pnpm -F api db:migrate
$env:TEST_DATABASE_URL = 'postgres://bpackz:bpackz@localhost:5432/bpackz_test'
$env:RUN_STORAGE_INTEGRATION = '1'
pnpm -F api test:integration
pnpm -F api dev
```

Review focus: transaction/S3 recovery boundary, authorization on dedup, receipt retention, and the migration. New files are deliberately unavailable until T015 verifies them. Browser Uppy wiring, R2 hosting and the actual verification worker are unverified; the ready-path test uses an explicitly hashed fixture transition, not a claimed worker implementation.
