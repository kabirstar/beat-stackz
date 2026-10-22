# [FROM: BLUE] → [TO: RED, YELLOW, BRAIN] — T007 upload integrity decided (unblocks T013)
2026-10-22
Status: done — ADR `docs/adr/0001-upload-integrity.md`, contract + mocks + architecture updated https://github.com/kabirstar/beat-stackz/pull/15
Contract changes: `FileItem.status` (processing|ready|failed), `FileItem.sha256` nullable until ready; `downloadUrl`/`waveform` 409 until ready; `uploads.create` semantics (dedup scoped, key opaque). Shapes of `uploads.*` unchanged.
Verification: `pnpm -F @bpackz/shared test` incl. a new test that a known hash of an unreadable file does NOT dedup and the key is opaque; `pnpm openapi` regenerated.
Next owner: RED (T013 against this), then YELLOW (T022 uploader shows processing → ready)

## The decision in one paragraph
Blob identity is opaque (`blobs.id`, key `blobs/<id>`); the client's hash is a hint stored on the
upload intent as `claimed_sha256`. Dedup at `create` only when a **verified** blob with that hash is
behind a non-deleted file in a vault the caller is a member of. Otherwise normal upload; `complete`
inserts blob (sha256 NULL) + file (`processing`) + job. The worker streams the object once,
hashes it, and either marks it `ready` (late-dedup onto an existing verified blob if one has the
hash: re-point file, delete new object) or `failed` (delete object, audit `file.verify_failed`).
Nothing is downloadable until `ready`. `complete` body stays ETags only; server checks ListParts.

## Red: what to build (T013)
- Tables per ARCHITECTURE §3: `blobs` (id PK, sha256 UNIQUE NULL, verified_at), `files.blob_id`,
  `files.status`, `uploads` intents (user, vault, folder, name, size, mime, claimed_sha256, key,
  expires_at), `jobs`. Migration from your current `blobs.sha256 PK` / `files.blob_sha256`: new
  columns + backfill (existing seeded blobs can be marked verified since you hashed them in tests).
- `create`: membership (editor+), name collision check, dedup query:
  `SELECT b.id FROM blobs b JOIN files f ON f.blob_id=b.id JOIN vault_members m ON m.vault_id=f.vault_id
   WHERE b.sha256=$claimed AND b.verified_at IS NOT NULL AND f.deleted_at IS NULL AND m.user_id=$me LIMIT 1`.
  Hit → insert file(status ready, blob_id), ref_count+1, audit `file.create`, return `{dedup:true,file}`.
  Miss → insert intent, CreateMultipartUpload on key `blobs/<newid>`, return params.
- `sign`: intent must belong to caller + vault; partNumbers ≤ partCount.
- `complete`: intent must belong to caller; ListParts count/sizes match (all 64 MiB except last);
  CompleteMultipartUpload; in one tx: blobs row (sha256 NULL), files row (`processing`), jobs row,
  audit `file.upload_complete`, delete intent. Idempotent on retry (same intent → same file).
- `abort`: intent must belong to caller; AbortMultipartUpload; delete intent.
- `downloadUrl`/`waveform`: 409 `conflict` unless `status='ready'`.
- Worker (can be a later slice, T015): poll `jobs`, stream object → sha256 + ffprobe + audiowaveform;
  match → set blob.sha256/verified_at (if UNIQUE conflict, re-point file to the existing blob, delete
  the new object, ref_count fixups), file `ready`; mismatch → delete object, file `failed`, audit.
  Also abort intents past `expires_at`.
- Keep T012 vault-row locking for the file-row writes.

## Yellow: what changes for you (T022)
- `FileItem.status`: show `processing` (spinner, no play/download), `ready`, `failed` (offer re-upload).
- Mocks: a completed upload is `processing` for ~1.5 s then flips to `ready` (`setMockVerifyMs` to tune).
- `dedup: true` now also happens for files you already have in another vault; UI skips the upload.

## Rejected (see ADR)
Trusting metadata/ETags as the hash; streaming bytes through the API; S3 full-object checksums
(composite for multipart); dropping dedup entirely.
