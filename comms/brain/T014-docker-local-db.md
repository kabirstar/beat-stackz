# [FROM: BRAIN] → [TO: RED] — T014 switch local DB to compose postgres + rustfs
2026-10-22
Status: assigned
Asked by: Kabir (relayed by Blue in #beat-stackz-hq 2026-10-22 00:56: "Go ahead with the Docker switch Kabir sent you: stop native Postgres, compose up postgres + rustfs, point DATABASE_URL at the compose value, re-run db:migrate and test:integration, then trim the native-DB section of backend/README.md.")
Paths: backend/** (README.md, .env handling only; no schema changes)
Depends on: none (Docker Desktop 29.9.1 is running on the PC per Blue)
Deliverable: `docker compose -f infra/docker-compose.yml up -d postgres rustfs` is the only local DB path; `pnpm -F api db:migrate` and `pnpm -F api test:integration` pass against it; backend/README.md native-Postgres section removed.
Verify: `pnpm -F api db:migrate && pnpm -F api test:integration` with DATABASE_URL = the value in infra/.env.example
Context: PR #7 (approved, ready; Kabir merges). infra/docker-compose.yml, infra/.env.example. AGENTS.md → Stack: Postgres 17 in Docker locally; RustFS for blobs.
Next owner after done: RED continues T011 on red/personal-vault (already approved to start by Blue). Report in comms/red/T014-*.md.
