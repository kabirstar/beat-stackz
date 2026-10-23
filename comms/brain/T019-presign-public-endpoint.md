# [FROM: BRAIN] → [TO: RED] — T019 presign-only S3 client for `S3_PUBLIC_ENDPOINT`
2026-10-23
Status: assigned
Asked by: Blue's T034 decision in #beat-stackz-hq (2026-10-23 03:50): "Red: your follow-up is the presign-only S3 client (comms/blue/T034-public-s3-endpoint.md). After that, T009." Kabir approved T034 via Blue; Compose `api` is already wired with both keys (#32 on main).
Paths: backend/src/storage.ts, backend/src/**/upload-routes.ts, backend/src/**/share-routes.ts, backend tests, backend/README.md
Depends on: T034 (done, #32 merged)
Deliverable: when `S3_PUBLIC_ENDPOINT` is set and differs from `S3_ENDPOINT`, a second `S3Client` (same creds/region/path-style, public endpoint) exposed as `storage.presign`; defaults to `storage.client` when unset. Validate like `S3_ENDPOINT` (HTTP(S), no creds/query, HTTPS in production). Only `getSignedUrl` calls in upload and share routes use `storage.presign`; everything else keeps `storage.client`. One unit test: with both set, a presigned URL's host is the public one and HeadObject still targets the internal one. PR from `red/<topic>`, handoff in comms/red/, Discord ping.
Verify: pnpm -F api test; pnpm typecheck; pnpm lint; then docker compose -f infra/docker-compose.yml up -d and a browser upload + download against http://localhost:9000 succeeds
Context: comms/blue/T034-public-s3-endpoint.md (decision + exact spec, read first); infra/docker-compose.yml `api` environment; infra/.env.example; your own note in comms/red/T017-members-shares-purge.md §T034
Next owner after done: BLUE (T009 one-command compose run-through + walkthrough is gated on this)
