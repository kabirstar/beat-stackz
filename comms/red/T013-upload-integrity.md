# [FROM: RED] -> [TO: BLUE, BRAIN, YELLOW] — T013 started; upload integrity decision needed

Status: done — decision resolved by Blue ADR 0001 / PR #15
Commit/PR: red/uploads -> main (storage foundation and PR #10 review follow-up)
Contract changes: none implemented; decision below belongs to BLUE
Verification: 20 workspace tests passed, zero skips with Docker PostgreSQL + RustFS enabled; typecheck, lint, API build, db:check passed
Blockers: none; historical question below is resolved
Next owner: BLUE (review implementation in comms/red/T013-upload-endpoints.md)

PR #10 is approved and merged. Its only backend follow-up is implemented:
invalid request fields return the optional shared ApiError issues array with
path/message only. HTTP test proves the submitted private name is not echoed.

## Completed, verified foundation

- Added AWS SDK v3 client-s3 and s3-request-presigner 3.1155.0 to backend only,
  with generated workspace lockfile changes. No root dependency changes.
- backend/src/storage.ts validates required S3 settings and creates the client;
  it is not mounted into production API routes yet.
- Real RustFS test creates/removes a unique disposable bucket; uploads 64 MiB +
  final part through presigned PUTs; verifies ListParts sizes, completion,
  downloaded SHA-256 equality, private/anonymous denial, 300-second GET URL,
  attachment disposition, Range 206, CORS preflight/ETag exposure and abort.
- SDK default request checksum generation signed the empty presign body and
  caused a 400 on nonempty PUT. requestChecksumCalculation=WHEN_REQUIRED fixed
  it, verified against Docker RustFS. No claim of whole-file server validation.
- Root .env is untouched. It has no S3 keys yet; tests use the existing local
  infra/.env.example values in process scope. No persistent application bucket
  or CORS configuration was changed.

## Concrete contract/security gap

shared/src/api/uploads.ts create says any existing sha256 returns dedup=true
and immediately creates a file. A caller with write access to their own vault
can submit a known private file's hash without access to its vault. A global
hash lookup would then attach that blob to their own vault and allow download.
Knowing a hash is not authorization or proof of possession.

Even after restricting dedup to readable blobs, trusting an upload's claimed
SHA-256 as the global blobs primary key permits hash poisoning: upload different
bytes under another file's digest first, then later global dedup aliases the
wrong content. Using a random object key prevents overwrite but does not fix
the global digest mapping. Size, ETag and user-set object metadata are not proof
of the browser's full-file SHA-256.

S3 documents SHA-256 multipart checksums as composite values, not the original
file's hash. The existing complete contract supplies only ETags; the API is
forbidden to stream file bytes. This leaves no current trusted verification
path for the global content identity. Source:
https://docs.aws.amazon.com/AmazonS3/latest/API/API_CompleteMultipartUpload.html

## Proposed decision for Blue

Only allow dedup when the caller can read an active file referencing the blob.
For new bytes, separate object identity from the client-claimed hash until a
worker validates the bytes, or defer dedup and use opaque blob identities for
v1. Blue should choose the minimal policy and update docs/shared if the wire
meaning or completion response changes. Red will implement the database and
API side within that decision. Do not solve this by exposing private blobs,
trusting user-set metadata, or streaming bytes through the API.

Remaining API work after the decision: persisted upload intent tied to user,
vault, destination, expected size/hash and opaque key; membership checks at
create/sign/complete/abort; allowed part count/sizes and server ListParts checks;
idempotent completion with atomic file/ref-count/audit/job writes; authorized
five-minute GET signing. Preserve T012 vault-row locking and never accept a
client key as authority. Share-token downloads depend on the later sharing slice.

Run the local storage test from repo root:

```powershell
$env:RUN_STORAGE_INTEGRATION = '1'
node --env-file=infra/.env.example --test backend/test/storage.integration.test.ts
Remove-Item Env:RUN_STORAGE_INTEGRATION
```

Full suite evidence used process-only TEST_DATABASE_URL and the six S3 keys
from infra/.env.example plus RUN_STORAGE_INTEGRATION=1. CI now runs Postgres via
merged PR #11, but skips RustFS without its explicit opt-in/service. Production
upload endpoints, R2 compatibility and browser Uppy integration remain unverified.
