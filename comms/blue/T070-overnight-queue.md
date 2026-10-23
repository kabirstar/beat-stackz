# [FROM: BLUE] → [TO: BRAIN, RED, YELLOW] — T070 overnight polish queue (2026-10-23 night)
Status: proposed — runs once Kabir confirms in #beat-stackz-hq
Asked by: Kabir ("start working on polishing everything while we sleep")
Rules for every task below: no contract changes, no new env keys, no scope beyond the file vault, one PR each,
CI green, handoff + COMMS_LOG line + one Discord ping. If a task needs a human decision, write it as
`Status: question` and stop; do not guess. Unattended runs: one per agent at a time, 3 h cap (brain.py).

## RED (auto-dispatched; do in this order)
- **T071 readiness endpoint.** `GET /health/ready` → 200 only when Postgres answers `SELECT 1` and the
  bucket answers `HeadBucket`; 503 with `{db, storage}` booleans otherwise. `/health` stays liveness.
  Test: both paths. Coolify healthcheck can then point at it.
- **T072 auth rate limits.** Better Auth email sign-in/sign-up: max 10 attempts per IP per 10 minutes
  (Better Auth's built-in `rateLimit` with the DB storage it already has, or a 20-line middleware on the
  `/auth/*` route). 429 with `ApiError` `rate_limited`. Test: 11th request is 429.
- **T073 request hardening.** `bodyLimit` on every JSON route (64 KiB; uploads already have 2 MiB),
  `X-Content-Type-Options: nosniff` + `Referrer-Policy: no-referrer` on API responses. Tests exist for
  CORS; add one for the headers.
- **T074 worker: expired-intent + purge metrics line.** Once a minute, if anything was processed, log one
  JSON line `{verified, failed, purged, expired}` so Coolify's log view shows activity. No new deps.

## BLUE (auto-dispatched)
- **T075 nightly Postgres backup to R2.** New compose service `backup` in `infra/docker-compose.hosted.yml`
  only: `postgres:17` image, `restart: unless-stopped`, loops `sleep 86400`, runs `pg_dump -Fc` and uploads
  to R2 key `backups/bpackz-<date>.dump` with the existing `S3_*` env via `aws`-free curl SigV4 is too
  much — use the `amazon/aws-cli` image instead (two containers: dump to a shared volume, then upload).
  Keep 14 days (`aws s3 ls` + delete older). Document restore in `docs/HOSTING.md` §5. Kabir deploys tomorrow.
- **T076 uptime check.** `.github/workflows/uptime.yml`: cron every 15 min, `curl -fsS https://api.beatstackz.com/health`
  and the web root; on failure post to Discord via the existing webhook URL stored as a repo secret
  `DISCORD_WEBHOOK_URL` (Kabir adds the secret tomorrow; workflow must no-op cleanly when it is missing).
- **T077 BRAIN as a Windows scheduled task.** `brain/install-task.ps1` registers `BPACKZ-BRAIN` to run
  `py brain/brain.py` at logon with restart-on-failure, plus `brain/README.md` section. Do not run it;
  Kabir runs it once tomorrow.

## YELLOW (Mac, manual — morning list, not dispatched)
- **T078** `main.tsx`: render the app even if the mock worker fails to register; visible signed-out state
  instead of a console 401 (from Blue's T009b note).
- **T079** Browser acceptance on the live site: sign up, upload a real stem, play it, share it, trash it;
  report with screenshots. Then icons by `folder.kind` (T026b) if not done.

## Explicitly NOT tonight
Payments/marketplace (out of scope), email delivery, passkeys, Cloudflare proxy (orange cloud), server
resizing, secret rotation (Kabir + Blue tomorrow, needs the DB password step), Coolify auto-deploy webhook
(needs Kabir's Coolify login).
