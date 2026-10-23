# [FROM: RED] → [TO: BLUE, BRAIN] — T019 presign-only S3 client for `S3_PUBLIC_ENDPOINT`
2026-10-23
Status: done (code + local checks; awaiting Blue review)
Commit/PR: red/t019 → PR #33 https://github.com/kabirstar/beat-stackz/pull/33
Contract changes: none (env only; key already in infra/.env.example and compose `api` from #32)
Verification: `pnpm -F api test` with TEST_DATABASE_URL + RUN_STORAGE_INTEGRATION=1 on Docker Postgres/RustFS → 30 passed, 0 skipped; `pnpm -F api typecheck` + `pnpm lint` clean; compose `api` + `worker` built from this branch, host-side upload + download via presigned `localhost:9000` URLs succeeded
Blockers: none
Next owner: BLUE (review/merge #33, then T009 one-command compose run-through)

Scope followed comms/blue/T034-public-s3-endpoint.md and comms/brain/T019-presign-public-endpoint.md exactly. Unattended run; assumptions below.

Implementation:
- backend/src/storage.ts: `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` share one
  validator (HTTP(S), no credentials/query/fragment, HTTPS in production).
  When the public endpoint is set and differs, a second `S3Client` with the
  same credentials/region/path-style/checksum setting is exposed as
  `storage.presign`. Unset or identical: `presign === client`. The presign
  client never sends a request, so no extra `destroy()`; server.ts unchanged.
- backend/src/upload-routes.ts: both `getSignedUrl` calls (UploadPart in
  `/sign`, GetObject in `/files/:fileId/download`) now use `presign`.
  CreateMultipartUpload, ListParts, HeadObject, CompleteMultipartUpload,
  AbortMultipartUpload and DeleteObject keep `client`.
- share-routes.ts: no change. It contains no presigning; share-token
  downloads already go through the download route above, so they are covered.
- backend/test/storage.test.ts: rejects ftp://, embedded credentials and
  HTTP-in-production for the new key; with `S3_ENDPOINT=http://rustfs:9000`
  and `S3_PUBLIC_ENDPOINT=http://localhost:9000` a presigned UploadPart URL
  has host `localhost:9000` and a HeadObject request (captured in a
  finalizeRequest middleware, no network) targets `http://rustfs:9000`.
- backend/README.md: one paragraph on the key. TASKS.md: T019 entry (RED section).

Compose check (handoff verify line), from the host against the containers:
sign-up → POST uploads → POST sign → PUT part to the presigned URL → POST
complete (status processing) → worker verified to ready → GET download URL →
GET bytes equal to what was uploaded. Both presigned URLs had host
`localhost:9000`; the API container reached the bucket at `rustfs:9000`. This
was a scripted fetch flow, not a real browser; CORS is unchanged from T013, so
the browser difference is only the preflight already covered by `storage:setup`.
Yellow or Blue can confirm in the UI during T009.

Assumptions / notes for Blue:
- This worktree's root `.env` only had Discord keys. I appended the
  `infra/.env.example` DB/S3/auth keys with a random BETTER_AUTH_SECRET so
  the compose `api` could start (gitignored, local only, existing keys kept).
- Ran `pnpm -F api storage:setup` once against local RustFS to create the
  `bpackz` bucket; the API image does not do this on start. Worth a line in
  the T009 run-through.
- Hosted R2: leave `S3_PUBLIC_ENDPOINT` unset; behaviour is identical to before.
