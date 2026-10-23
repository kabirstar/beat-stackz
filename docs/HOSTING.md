# Hosting Beat Stackz (Hetzner + Coolify + Cloudflare R2)

Target: ~€6/month plus storage. One small VPS runs Postgres, the API, the web
app and the worker from the same compose file used locally. Files live in
Cloudflare R2 (S3 API, zero egress fees). Blue runs the deploy; Kabir creates
the accounts and secrets below, because they are billed to and owned by him.

## 0. What Kabir creates (one-time, ~30 minutes)

| What | Where | Blue needs |
|---|---|---|
| **Domain** | any registrar (a Shopify-registered domain works; only its DNS is used) | the domain name, and DNS managed in Cloudflare (change nameservers to Cloudflare's) |
| **Cloudflare account** | cloudflare.com, free plan | nothing yet |
| **R2 bucket** `bpackz` | Cloudflare → R2 → Create bucket (location: automatic) | the account id shown on the R2 page |
| **R2 bucket** `bpackz-backups` | same; then Settings → Object lifecycle rules → delete objects after 14 days | nothing (nightly `pg_dump` files land here, §5) |
| **R2 API token** | R2 → Manage R2 API Tokens → Create: permission *Object Read & Write*, scoped to **both** buckets `bpackz` and `bpackz-backups` | Access Key ID + Secret Access Key (shown once) |
| **Hetzner account** | hetzner.com/cloud | nothing yet |
| **Server** | Cloud → New project → Add server: Ubuntu 24.04, **CX23** (2 vCPU / 4 GB / 40 GB), Falkenstein or Ashburn, add your SSH key | the server's IPv4 |
| **Coolify** | on the server: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh \| bash` | Coolify URL + admin login (keep it; Blue gets a deploy key later) |

Secrets go in **one place only**: Coolify's environment panel for this stack
(it writes the `.env` the containers read). Never in the repo, never in Discord.

## 1. DNS (Cloudflare)

| Record | Name | Value | Proxy |
|---|---|---|---|
| A | `app` | server IPv4 | **off (grey)** |
| A | `api` | server IPv4 | **off (grey)** |
| A | `coolify` (optional) | server IPv4 | off |

Proxy off because Coolify's Traefik issues Let's Encrypt certificates itself
and must see the challenge directly. Turn the orange cloud on later if you want
Cloudflare in front; then switch Cloudflare SSL mode to Full (strict).

`app.<domain>` and `api.<domain>` share the same site, so the Better Auth
session cookie set by the API is sent on every request from the web app
(same-site, `SameSite=Lax`). Keep both under one domain.

## 2. Environment for the hosted stack

Start from `infra/.env.example`, then set:

```env
NODE_ENV=production
POSTGRES_PASSWORD=<long random>                 # new in prod override
DATABASE_URL=postgres://bpackz:<same>@postgres:5432/bpackz

S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=bpackz
S3_ACCESS_KEY=<R2 access key id>
S3_SECRET_KEY=<R2 secret>
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com   # same as S3_ENDPOINT for R2. Coolify
# refuses to delete a variable the compose file references, so set it explicitly rather than leaving it unset.

BETTER_AUTH_SECRET=<64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
BETTER_AUTH_URL=https://api.<domain>
API_ORIGIN=https://api.<domain>
WEB_ORIGIN=https://app.<domain>
```

The API refuses to start with the example secret or with non-HTTPS origins
when `NODE_ENV=production` (`backend/src/config.ts`), so a misconfigured
deploy fails loudly instead of serving insecure cookies.

## 3. Deploy with Coolify

1. Coolify → Project → **Add resource → Docker Compose** → source: the GitHub
   repo `kabirstar/beat-stackz`, branch `main`.
2. **Docker Compose Location:** `infra/docker-compose.hosted.yml`. Coolify
   takes exactly one compose file and does not enable compose profiles, so the
   base + overlay pair would start only Postgres (api/web/worker sit behind
   `--profile full`). `docker-compose.hosted.yml` is the hand-flattened hosted
   stack: no RustFS, no profiles, relative build contexts, `expose` instead of
   `ports`, every value `${VAR}` with `:?` guards on the required ones. Keep it
   in step with `docker-compose.prod.yml`, which remains the reference overlay
   for manual `docker compose -f base -f prod --profile full` runs. (Learned on
   the first deploy, 2026-10-23. `docker compose config` output cannot be
   committed instead: it bakes in absolute paths.)
3. Environment: paste section 2. Mark `BETTER_AUTH_SECRET`, `S3_SECRET_KEY`,
   `POSTGRES_PASSWORD` as secrets.
4. Domains: `web` → `https://app.<domain>` (port 80); `api` → `https://api.<domain>` (port 4000).
   Coolify also adds `www.app.<domain>` / `www.api.<domain>` entries by itself; they
   have no DNS and only produce certificate warnings. Removing them needs the
   Coolify admin password, so Kabir deletes them (or ignores the warnings).
   Coolify's Traefik issues Let's Encrypt certificates automatically.
5. Deploy. The API container runs migrations at start (`db:migrate` in its CMD).
6. One-time bucket setup (CORS for `WEB_ORIGIN`, multipart cleanup lifecycle),
   from the Coolify terminal on the `api` container:
   `pnpm -F api storage:setup`
7. Auto-deploy: enable the GitHub webhook in Coolify so every merge to `main`
   redeploys. CI already gates `main`.

## 4. Verify

From any machine:

```bash
API=https://api.<domain> WEB=https://app.<domain> WEB_ORIGIN=https://app.<domain> node infra/smoke.mjs
```

Expect `SMOKE OK`: signup, folder, presigned multipart upload straight to R2,
worker verification with waveform peaks, byte-exact download, share link,
revoke, trash. Then open `https://app.<domain>` and sign up for real.

## 5. Operations (minimal, add when needed)

- **Backups** (T044): Postgres is the only state besides R2. The `backup`
  service in `infra/docker-compose.hosted.yml` (image `infra/backup/Dockerfile`,
  script `infra/backup/backup.sh`) runs `pg_dump | gzip` every 24 h and uploads
  `bpackz-<UTC timestamp>.sql.gz` to `s3://$BACKUP_BUCKET`. Set `BACKUP_BUCKET=bpackz-backups`
  in Coolify's env; the R2 token must cover that bucket too. Retention is the
  bucket's 14-day lifecycle rule (§0), not code. The container logs
  `backup ok: <file> (<bytes>)` or `backup FAILED`; glance at it in Coolify.
  Run one on demand: `docker compose --project-directory . -f infra/docker-compose.hosted.yml run --rm backup once`.
  **Restore** (tested locally 2026-10-23): download the file, then
  `gunzip -c <file> | docker compose exec -T postgres psql -U bpackz -d bpackz`
  into an empty database (`dropdb`/`createdb bpackz` first, or restore into a
  scratch db to inspect). Stop `api` and `worker` while restoring.
  Local check: `docker compose -f infra/docker-compose.yml --profile backup run --rm backup once`.
- **Logs**: Coolify shows container logs; the worker logs every verification.
- **Scaling**: CX23 is fine for a few hundred users. Uploads bypass the server
  entirely, so disk and bandwidth stay flat; CPU is the worker's ffmpeg pass.
  One worker handles one upload at a time; if uploads visibly queue, run a
  second `worker` replica (`docker compose up -d --scale worker=2`; jobs use
  `SKIP LOCKED`, so this is safe). Next step up is CX33 or managed Postgres.
- **Postgres has no host port** in production; use `docker compose exec postgres psql -U bpackz`.
- **Updates**: `main` is the deploy branch; Blue merges only green CI.

## Not doing

- Shopify as a host: it cannot run the API, Postgres, the bucket or the worker.
  A Shopify-registered domain's DNS can still point `app`/`api` at the server.
- Kubernetes, managed queues, CDN for the app: nothing here needs them yet.
