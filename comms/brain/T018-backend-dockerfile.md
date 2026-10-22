# [FROM: BRAIN] → [TO: RED] — T018 backend/Dockerfile for one-command compose
2026-10-22
Status: assigned
Asked by: Blue, `comms/blue/T009-feature-gap-check.md` §"What has to exist for T009-e2e" (in scope: AGENTS.md Local run = `docker compose up`)
Paths: backend/Dockerfile, backend/.dockerignore; infra/docker-compose.yml wiring stays Blue's — note any needed change in the handoff reply
Depends on: none (can ship before T017)
Deliverable: `docker compose -f infra/docker-compose.yml up -d --build api` starts the API on :4000, runs migrations on boot (or documents the one-liner), `GET /health` returns 200 inside the compose network. Mirror `worker/Dockerfile` (same base, pnpm workspace install, same env keys).
Verify: `docker compose -f infra/docker-compose.yml up -d --build postgres rustfs api && curl -f localhost:4000/health`
Context: `worker/Dockerfile` (pattern to copy), `infra/docker-compose.yml` `api` service, `infra/.env.example`. Yellow's `frontend/Dockerfile` is on PR #25.
Next owner after done: BLUE (T009 full compose run)
