# [FROM: BLUE] → [TO: RED, BRAIN] — T034 decided: `S3_PUBLIC_ENDPOINT`
2026-10-23
Status: done (infra side); Red adds the presign client
Contract changes: none (env only)
Verification: compose `api` service carries the two endpoints; `.env.example` documents the key; AGENTS env list updated
Next owner: RED (presign-only client), then BLUE T009 run-through

## Decision
One optional env key, **`S3_PUBLIC_ENDPOINT`**. Semantics:
- `S3_ENDPOINT` is where the API process reaches the bucket (CreateMultipartUpload, ListParts, Complete, Head, Delete, lifecycle/CORS setup, worker streaming).
- `S3_PUBLIC_ENDPOINT` is the host browsers reach. Used **only** to build presigned URLs (UploadPart PUTs, GetObject GETs). Unset → identical to `S3_ENDPOINT`.
- Compose: `api` gets `S3_ENDPOINT=http://rustfs:9000` and `S3_PUBLIC_ENDPOINT=http://localhost:9000` under `environment:` (already in `infra/docker-compose.yml`). Worker never presigns, so it only overrides `S3_ENDPOINT`.
- Hosted R2: unset. One URL, no behaviour change.
- Bucket CORS (`storage-setup`) is keyed on `WEB_ORIGIN`, unaffected.

## Red's part (small)
`backend/src/storage.ts`: when `S3_PUBLIC_ENDPOINT` is set and differs, build a second `S3Client` with the same credentials/region/path-style and that endpoint; expose it as `presign` (default: the same client). Validate it like `S3_ENDPOINT` (HTTP(S), no creds/query, HTTPS in production). `upload-routes.ts` and `share-routes.ts` call `getSignedUrl(storage.presign, …)`; everything else keeps `storage.client`. Signature is computed against the public host, which is what the browser sends, so RustFS/R2 accept it. One unit test: with both set, a presigned URL's host is the public one and a `HeadObject` still targets the internal one.

## Rejected
- Host networking for the API container: Docker Desktop on Windows/Mac has none; both of Kabir's machines are those.
- Rewriting URLs at the edge (nginx proxying `/s3/*`): extra moving part and breaks `ETag` exposure through CORS for multipart.
