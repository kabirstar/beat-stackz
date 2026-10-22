# ADR 0001 — Upload integrity: opaque blobs, verified hashes, scoped dedup

Date: 2026-10-22 · Status: accepted · Owner: Blue · Asked by: Red (T013), routed by BRAIN (T007)

## Problem

The v1 contract let `uploads.create` return `dedup: true` for any existing
`sha256` and keyed blobs by the client-claimed hash. Two holes:

1. **Hash as authorization.** Anyone who knows a file's hash could attach that
   blob to their own vault and download it. Knowing a hash is not possession.
2. **Hash poisoning.** Bytes go browser → bucket; the API never sees them
   (rule 3). S3 multipart checksums are composite, not the file's SHA-256. So the
   claimed hash was unverified, yet it was the blob's primary key. Upload wrong
   bytes under a real file's hash first, and every later dedup aliases garbage.

## Decision

1. **Blob identity is opaque.** `blobs.id` is a random id; the object key is
   `blobs/<id>`. The client's hash is stored on the upload intent as
   `claimed_sha256` and is never a key.
2. **The worker verifies.** After `complete`, the file is `status='processing'`.
   The worker streams the object once (it already does for ffmpeg), computes
   SHA-256 and duration/waveform, then:
   - match → `blobs.sha256 = hash`, `verified_at = now()`, file `ready`. If a
     *different* verified blob already has that hash, re-point the file to it,
     delete the new object (late dedup; the uploader proved possession by uploading).
   - mismatch → delete the object, file `failed`, audit `file.verify_failed`.
     Client re-uploads.
3. **Dedup only against readable, verified blobs.** `uploads.create` returns
   `dedup: true` only when a verified blob with `sha256 = claimed` is referenced
   by a non-deleted file in a vault the caller is a member of. One query, same
   shape as the membership check. Otherwise it is a normal upload.
4. **Not ready, not served.** `downloadUrl` and `waveform` return 409 `conflict`
   while a file is `processing` or `failed`.
5. **`complete` body stays ETags only.** The server verifies part count and
   sizes via ListParts; nothing the client sends is treated as proof.

## Contract changes (`shared/`)

- `FileItem.status: 'processing' | 'ready' | 'failed'`; `FileItem.sha256`
  nullable until ready.
- `uploads.create` response shape unchanged; `key` is server-chosen and opaque.
- `files.downloadUrl` / `files.waveform`: 409 until `ready`.

## Schema changes (Red, `backend/`)

`blobs(id PK, s3_key, size, mime, sha256 UNIQUE NULL, verified_at NULL,
duration_ms, waveform, ref_count)`; `files.blob_id → blobs.id`;
`files.status`; `uploads(id, user_id, vault_id, folder_id, name, size, mime,
claimed_sha256, key, created_at, expires_at)`; `jobs(id, kind, file_id, state,
attempts, run_after, last_error)`.

## Rejected

- Trusting user-set object metadata or ETags as the hash (not proof).
- Streaming bytes through the API to hash them (rule 3; defeats presigned uploads).
- Full-object S3 checksums (SHA-256 is composite on multipart; R2/RustFS support uneven).
- No dedup at all (loses the cheap "same stem in two vaults" win; scoped dedup keeps it safely).

## Consequences

A new file is downloadable only after the worker runs, typically seconds. The
UI shows `processing`. The worker becomes required for uploads, not just
waveforms; it was already in the compose file.
