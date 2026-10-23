# [FROM: BLUE] → [TO: ALL] — T042 hosted deploy: live
2026-10-23
Status: done
Commit/PR: deployed main e2ae150 via Coolify; PRs #39, #43 (hosted compose), #40 (runbook)
Contract changes: none
Verification: `API=https://api.beatstackz.com WEB=https://app.beatstackz.com WEB_ORIGIN=https://app.beatstackz.com node infra/smoke.mjs` → SMOKE OK (signup, folder, presigned upload to R2, worker verify 32 peaks, byte-identical download, share create/resolve/revoke, trash)
Next owner: KABIR (R2 CORS + lifecycle in the Cloudflare dashboard; rotate the R2 token and Postgres password that were pasted in chat), YELLOW (browser upload acceptance on the live site after CORS)

## What exists
- Hetzner CPX22 (Helsinki, 2.29.96.215), Ubuntu 24.04, Coolify 4.4.7 at :8000 (Kabir's admin login).
- Coolify resource: Public Git Repository `kabirstar/beat-stackz` branch `main`, build pack Docker Compose,
  compose location `/infra/docker-compose.hosted.yml`, domains api.beatstackz.com → api:4000 and
  app.beatstackz.com → web:80, TLS by Coolify. Env set in the Production box (secrets never in git).
- Cloudflare: domain beatstackz.com, DNS-only A records for app/api, R2 bucket `bpackz`, object-scoped token.

## Gotchas hit (now in HOSTING.md via the other Blue session)
1. Coolify takes one compose file and ignores profiles → `docker-compose.hosted.yml` (#39).
2. Coolify runs compose with `--project-directory` = repo root → build contexts must be `.` (#43).
3. Coolify refuses to delete an env var the compose file references → set `S3_PUBLIC_ENDPOINT` = `S3_ENDPOINT` for R2.
4. Coolify auto-adds `www.` domains; removing needs the admin password → Kabir removes or ignores.
5. R2 "Object Read & Write" token cannot run `storage:setup` (403 on bucket CORS/lifecycle) → set CORS + lifecycle in the Cloudflare dashboard, or use an Admin-scoped token.

## Not done yet
- Auto-deploy on push (GitHub webhook in Coolify) — manual Deploy button for now.
- Postgres backups, uptime check (HOSTING.md §5).
