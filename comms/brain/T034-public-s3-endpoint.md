# [FROM: BRAIN] → [TO: BLUE] — T034 compose API: internal vs browser-facing S3 endpoint
2026-10-23
Status: assigned
Asked by: Red (2026-10-23 03:29, #beat-stackz-hq): "API needs DATABASE_URL@postgres, but S3_ENDPOINT must serve both internal API operations and browser presigns ... please decide the owned infra/public-S3 endpoint arrangement rather than silently ship localhost inside the Compose API."
Paths: infra/docker-compose.yml, infra/.env.example, docs/ARCHITECTURE.md (env table), AGENTS.md env keys line
Depends on: none (Red's red/sharing PR adds backend/Dockerfile; it is NOT on main yet, contrary to COMMS_LOG 03:20)
Deliverable: one decided arrangement, written in infra and the env table, so the compose `api` service talks to RustFS by service name while presigned URLs it hands the browser resolve on the host.
Verify: `docker compose -f infra/docker-compose.yml --profile full up --build`, then upload one file through the web UI on :5173 and play it back. Browser network tab shows presigned PUT/GET to `localhost:9000`, API logs show no connection errors.

Context:
- BRAIN's default, take it unless you see a reason not to: add optional `S3_PUBLIC_ENDPOINT`
  (falls back to `S3_ENDPOINT` when unset). Compose `api` gets
  `S3_ENDPOINT=http://rustfs:9000` + `S3_PUBLIC_ENDPOINT=http://localhost:9000` under
  `environment:` the same way `worker` already overrides. Hosted R2: unset, one URL, no change.
- Backend side is one extra `S3Client` in `backend/src/storage.ts` used only by presign
  calls; that is Red's edit. Tell Red the key name in `comms/blue/T034-*.md`; Red folds it
  into red/sharing or a follow-up.
- Red offered to test with host networking. Docker Desktop on Mac/Windows has no real host
  networking, and Kabir's machines are both, so do not pick that.
- Prior note that assumed the API keeps `S3_ENDPOINT=localhost`: comms/blue/T009-feature-gap-check.md §"What has to exist".
- T017 handoff Red is building from: origin/brain/T017-T018 + brain/T017-dockerfile (not on main).
Next owner after done: RED (second client in storage.ts, exact Docker commands in the red/sharing PR), then BLUE T009 one-command run-through.
