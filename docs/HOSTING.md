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
| **R2 API token** | R2 → Manage R2 API Tokens → Create: permission *Object Read & Write*, scoped to bucket `bpackz` | Access Key ID + Secret Access Key (shown once) |
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
# S3_PUBLIC_ENDPOINT unset: R2 presigned URLs are browser-reachable as is

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
2. Compose file paths: `infra/docker-compose.yml` **and** `infra/docker-compose.prod.yml`
   (Coolify's "Docker Compose Location" accepts the base; add the override in
   the build command field as `-f infra/docker-compose.prod.yml --profile full`).
3. Environment: paste section 2. Mark `BETTER_AUTH_SECRET`, `S3_SECRET_KEY`,
   `POSTGRES_PASSWORD` as secrets.
4. Domains: `web` → `https://app.<domain>` (port 80); `api` → `https://api.<domain>` (port 4000).
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

- **Backups**: Postgres is the only state besides R2. Coolify can schedule
  `pg_dump` to an S3 target; point it at a second R2 bucket. Do this before
  inviting anyone outside the team.
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
