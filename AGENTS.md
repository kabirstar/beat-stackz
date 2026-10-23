# Beat Stackz (BPACKZ) — AGENTS.md

File vault for artists and producers. Each user has a private space; a
**shared vault** is a space two or more users co-own (create folders, upload,
share), Google-Drive style. Runs locally with zero cloud accounts; moves to a
hosted box by changing env vars. Full design: `docs/ARCHITECTURE.md`.

**Scope (Kabir, 2026-10-21): file vault only. No payments, no marketplace, no
public catalog.** Don't build toward them.

**Vision (Kabir, 2026-10-23):** for artists and producers, to ease creating,
sharing and marketing music. Every vault starts with the default folder
taxonomy in `docs/adr/0002-default-folder-taxonomy.md` (`DEFAULT_FOLDERS` in
`shared`); folders carry a `kind` so icons survive renames.

## Team

| Agent | Machine | Owns | Does not touch |
|---|---|---|---|
| **Yellow** (Antigravity/Gemini) | Mac | `frontend/**` | `backend`, `shared`, infra |
| **Red** (Astra) | PC | `backend/**`, `worker/**` | `frontend`, `shared`, infra |
| **Blue** (Claude) | PC | `shared/**`, `docs/**`, `infra/**`, `brain/**`, `.claude/**`, root configs, code review | app code except via review |
| **BRAIN** (Claude agent, run by `brain/brain.py` on the PC) | PC | `comms/brain/**`, its own section of `TASKS.md`, `.claude/agents/*` and `.claude/skills/*` it creates. When it delegates to RED or BLUE, the loop starts that agent's run unattended in `../bpackz-red` / `../bpackz-blue` (T025, Kabir 2026-10-23; see `brain/README.md`) | product code; never pushes `main` or merges |
| **Kabir + Swish** (humans; Kabir is also Todo / Lush / `prodbylush808`, Swish is `mysterious_cheetah_19465` on Discord) | — | product decisions, design direction, scope; may merge or veto anything. Equal authority | — |

**BRAIN** is the front door. Humans talk to BRAIN in `#beat-stackz-hq`; BRAIN reads
`TASKS.md`, `COMMS_LOG.md`, `comms/*` and open PRs, then delegates with a handoff
file in `comms/brain/` plus a Discord ping, or spins up a purpose-built agent and
saves it as a skill under `.claude/skills/` so the next run starts from what it
learned. Talking to Yellow, Red or Blue directly still works; BRAIN just keeps
the board straight. See `brain/README.md`.

Rule: you edit only inside the paths you own. Need a change elsewhere? Write it
in that owner's inbox (see Comms). Blue may make one-line fixes anywhere during
review, and says so in the PR.

## Stack (decided — change only via Blue + Kabir)

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | `pnpm -F web dev`, `pnpm -F api dev` |
| Frontend | Vite + React 19 + TypeScript + Tailwind | `frontend`. Talks to API only through `@bpackz/shared` client |
| API | Hono or Fastify (Red's pick) on Node 24 + Drizzle ORM | `backend`. Single process, port 4000. Must validate with the shared zod schemas and emit OpenAPI from them |
| Auth | Better Auth (email+password now; passkeys later) | Sessions = DB rows + HttpOnly cookie |
| DB | Postgres 17 | Docker locally, VPS later |
| Blobs | S3 API via AWS SDK v3. RustFS locally → Cloudflare R2 hosted | Never write to local filesystem. MinIO is archived; do not use |
| Uploads | Presigned multipart, 64 MiB parts, browser → bucket | Uppy `@uppy/aws-s3` on the web side. API never proxies file bytes |
| Audio | `worker`: ffmpeg + BBC audiowaveform, polls a `jobs` table | No queue service |
| Local run | `docker compose up` from repo root | postgres, rustfs, api, web, worker |
| Hosted | Hetzner VPS + Coolify + R2 | same compose minus rustfs |

## Repo layout

```

frontend/     Yellow   Vite React SPA
backend/      Red      Hono/Fastify API, Drizzle schema + migrations, Better Auth
worker/       Red      waveform/ffmpeg jobs

shared/       Blue     zod schemas, API route contracts, generated TS client, shared types
docs/         Blue     ARCHITECTURE.md, ADRs, API notes
infra/        Blue     docker-compose.yml, .env.example, Coolify config
comms/        all      <owner>/<task-id>.md — one handoff file per task (brain/ = BRAIN)
brain/        Blue     BRAIN Discord loop + README
.claude/      Blue     agents/ and skills/ (BRAIN adds to these)
COMMS_LOG.md  all      one-line index of handoffs (append only)
TASKS.md      all      task board
AGENTS.md     Blue     this file
```

## The API contract is the handoff

`shared/src/api/*.ts` defines every route as a zod schema pair
(request, response) plus the path, method, auth requirement and error codes.
Red implements exactly that; Yellow consumes exactly that through the
generated client. Neither invents fields. OpenAPI (`contracts/openapi.json`,
with examples) is **generated** from the zod schemas in CI, never hand-edited.
Want a new field or route? Open a handoff to Blue (see Comms); Blue updates
`shared`, bumps nothing (it's a workspace package), and pings both.

Until the API exists, Yellow runs against `pnpm -F web dev:mock` (MSW handlers
in `frontend/src/mocks`, generated from the same schemas). Yellow is never
blocked on Red.

## Comms

- **Handoffs**: one file per task, `comms/<sender>/<task-id>-<slug>.md`.
  You only ever create files under your own color. Header:
  ```
  # [FROM: RED] → [TO: BLUE] — T012 presigned multipart routes
  Status: done | blocked | question
  Commit/PR: red/uploads → PR #14
  Contract changes: none | describe
  Verification: `pnpm -F api test` → 12 passed
  Blockers: ...
  Next owner: YELLOW (wire uploader to real routes)
  ```
  Replies are new files in the replier's folder referencing the same task-id.
- **TASKS.md**: one section per owner. Edit only your own section. Every
  entry has: id, owner, allowed paths, depends-on, deliverable, verification
  command. Format:
  ```
  - [ ] T012 [RED] presigned multipart routes
        paths: backend/src/uploads/**  depends: T003
        deliverable: create/sign/complete/abort per shared contract
        verify: pnpm -F api test
  ```
- **Decisions**: `docs/adr/NNNN-title.md`, written by Blue. One page max.
- No single shared log file. `COMMS_LOG.md` would conflict on every push.

## Git flow

- Branch per agent: `yellow/<topic>`, `red/<topic>`, `blue/<topic>`. Short-lived.
- Red and Blue share the PC: each works in its own git worktree
  (`git worktree add ../bpackz-red red/<topic>`), never the same checkout.
- `main` is protected. Everything lands by PR. Blue reviews and, once CI is green, merges (squash, delete branch). Kabir authorized this 2026-10-21; Kabir can still merge or veto anything. Never delete a base branch that has a stacked PR on it: GitHub auto-closes the child.
- Before pushing: `git fetch && git rebase origin/main`. Resolve `pnpm-lock.yaml`
  conflicts by taking either side then running `pnpm install` and committing.
- Dependencies: add to **your app's** `package.json` only. Root deps are Blue's.
- Commit messages: `[yellow] short imperative line`. Attribution trailer per
  your tool's convention.
- CI (GitHub Actions, Blue): `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `pnpm -F @bpackz/shared build`. Red PRs must pass `drizzle-kit check` (no drift).

## Rules of engagement

1. Smallest diff that works. No speculative abstractions, no "for later" scaffolding.
2. Security is not optional: validate every request body with the shared zod
   schema; every file/folder route runs the vault-membership check (one query,
   see ARCHITECTURE §3); never trust `vault_id` from the client without it.
3. API never streams file bytes. Presigned URLs only, 5-minute expiry on GET.
4. Non-trivial logic ships with one runnable check (a small test or self-check).
5. Soft delete (`deleted_at`) everywhere; a purge job deletes for real after 30 days.
6. Every mutation writes an `audit_log` row in the same transaction.
7. Secrets only in `.env` (gitignored). `.env.example` lists every key with a fake value.
8. If you are unsure which agent owns something, it's Blue's — ask in `comms/blue.md`.

## Local setup (any machine)

Prereqs: Node 24, pnpm, Docker Desktop, ffmpeg (worker only, dev mode). Python not needed.

One command, everything in containers (T009):

```bash
cp infra/.env.example .env            # then replace BETTER_AUTH_SECRET with 32+ random chars
docker compose -f infra/docker-compose.yml --profile full up -d --build
node infra/smoke.mjs                  # signup → upload → worker verify → download → share → trash
```

Web http://localhost:5173, API http://localhost:4000, bucket console http://localhost:9001.

Dev mode (hot reload, services only in Docker):

```bash
docker compose -f infra/docker-compose.yml up -d postgres rustfs
pnpm install
pnpm -F api db:migrate
pnpm dev          # turbo: web on :5173, api on :4000
```

## Env keys

`DATABASE_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
`S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_ENDPOINT` (optional; the
browser-facing bucket URL when it differs from the API-facing one, i.e. in
compose), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`, `API_ORIGIN`,
`INVITE_CODE` (required in production; sign-up is rejected without it, ADR 0003).

## v1 build order

1. Blue: shared schemas for auth, vaults, folders, files, uploads, shares. Compose + CI.
2. Red: migrations, Better Auth, vault/folder/file CRUD, presigned multipart routes.
   Yellow (parallel, on mocks): login, vault switcher, folder tree, file list, uploader.
3. Red: shared vault invites, share links, trash. Yellow: sharing UI, trash UI.
4. Red: worker + waveform JSON. Yellow: inline player.
5. Blue: hosted deploy on Hetzner + R2.
