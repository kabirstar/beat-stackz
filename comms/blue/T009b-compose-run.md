# [FROM: BLUE] → [TO: ALL] — T009b one-command compose run-through
2026-10-23
Status: done
Commit/PR: blue/t009-compose-smoke → PR (link in COMMS_LOG)
Contract changes: none
Verification: `docker compose -f infra/docker-compose.yml --profile full up -d --build` → 5 containers up; `node infra/smoke.mjs` → SMOKE OK; browser at http://localhost:5173 renders The Vault and calls the real API (`GET /me` → 401 signed out)
Next owner: YELLOW (one note below), then BLUE (hosted deploy)

## Result
The whole product runs from one command on the PC. `infra/smoke.mjs` (new, no deps) proves the path a real user takes:
signup → `/me` → personal vault → create folder → presigned multipart PUT straight to the bucket → complete → worker verifies (status `ready`, duration 1000 ms, 32 waveform peaks) → download bytes identical → share link → anonymous resolve + token download → revoke → 404 → trash.

## Two bugs found and fixed here
1. **No `.dockerignore`** (root, Blue). `COPY frontend frontend` copied the host's Windows `node_modules` (pnpm junctions) over the image's Linux install, so `pnpm -F web build` died with "Cannot find module typescript/bin/tsc". Added `.dockerignore` excluding node_modules, dist, .git, local clones, logs, `.env`, `.claude`.
2. **Mock flag name mismatch** (`frontend/Dockerfile`, Yellow's file; Blue one-line fix, flagged in the PR). `main.tsx` disables mocks only when `VITE_MOCK === "false"`; the Dockerfile set `VITE_USE_MOCKS=0`. Every production image therefore started MSW, the service-worker registration failed under nginx, `enableMocking()` rejected, and the app never rendered — blank page. Dockerfile now sets `VITE_MOCK=false`.

## For Yellow (T020 hardening, not urgent)
`main.tsx` renders the app only after `enableMocking()` resolves. If the mock worker ever fails to register, the user sees nothing. Render regardless (`.finally`), or catch and log. Also consider a visible signed-out state: today the first paint shows "The Vault" with a 401 in the console before the auth modal.

## For Blue (next: hosted deploy)
Everything the VPS needs exists: three Dockerfiles, compose with `--profile full`, `S3_PUBLIC_ENDPOINT` for the browser-facing bucket URL (T034), migrations at API startup. Hosted differences: drop `rustfs`, point `S3_*` at R2 and `S3_PUBLIC_ENDPOINT` at the R2 public hostname, set `WEB_ORIGIN`/`BETTER_AUTH_URL`/`API_ORIGIN` to real HTTPS origins, pass `VITE_API_ORIGIN` as a build arg for `web`, and put web + api behind one domain so the session cookie stays first-party. Run `infra/smoke.mjs` with `API=... WEB=...` against the deployed stack.

## .env on the PC
Now has the full key set (Discord + app). `BETTER_AUTH_SECRET` is a generated 64-hex value; the backend refuses the example one. Not committed.
