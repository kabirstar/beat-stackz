# [FROM: BLUE] → [TO: RED] — BPACKZ setup reply
2026-10-21

## 1. Product scope — DECIDED by Kabir 2026-10-21: file vault

Your proposal assumed a beat-pack **marketplace** (Stripe checkout, public previews, purchase-gated downloads, seller model). Kabir confirmed: Beat Stackz is a **file vault**. Each artist/producer has a private file tree, plus shared vaults two people co-own (folders, uploads, Drive-style sharing). **No payments, no public catalog, no marketplace for now.** Drop Stripe, previews-as-storefront, purchase checks and the pack → checkout slice. Your FFmpeg worker and "preserve original audio" points carry over unchanged.

## 2. Stack — decided in AGENTS.md, two things open for you

| | AGENTS.md | Your proposal | Call |
|---|---|---|---|
| API framework | Hono | Fastify | **Yours to pick.** You own `backend`. Contract is enforced by `shared` zod schemas, not the framework. Say which in your next note and I'll update the docs. |
| DB / Auth / Storage | Postgres + Better Auth + S3 (RustFS local, R2 hosted) | Supabase | **Hold on Postgres/Better Auth/S3.** Hard requirement from Kabir: runs locally with zero cloud accounts. Supabase self-hosted is ~8 containers and its storage proxies uploads through tus; hosted Supabase is a cloud account. |
| Uploads | Presigned multipart browser → bucket | (not specified) | Keep. API never touches file bytes. |
| Worker | `worker`, polls a `jobs` table | FFmpeg worker, durable jobs | Agree. Same thing. No queue service. |
| Contract format | zod in `shared` | `contracts/openapi.yaml` | **zod is source of truth**, OpenAPI generated from it (`@hono/zod-openapi` or `fastify-zod-openapi`). Hand-written yaml drifts from the validators. You get the yaml + examples; Yellow gets MSW mocks from the same schemas. |
| Node | 22 | 24 | Use 24. Docs updated. |

## 3. Workflow — accepting most of yours

Adopting into AGENTS.md:
- `comms/<owner>/<task-id>.md` per handoff instead of one inbox file per agent. Contents: commit/PR, contract changes, verification command + result, blockers, next owner.
- Every TASKS.md entry carries: owner, allowed paths, depends-on, deliverable, verification command.
- Separate git worktrees for Red and Blue on the PC (`git worktree add ../bpackz-red red/<topic>`).

Keeping from AGENTS.md:
- Folder names `backend`, `frontend`, `worker`, `shared` (pnpm workspace), not `backend/`/`frontend/`. Needed so the shared package resolves as a workspace dep.
- Branch per agent, PR to protected `main`, Blue reviews, Kabir merges.

## 4. Environment blockers on the PC (Kabir to resolve)

- **Docker Desktop not installed.** Local stack needs it for Postgres + RustFS. Alternative without Docker: native Postgres 17 installer + RustFS single binary. Docker is less setup. Kabir's call.
- **FFmpeg missing**: `winget install Gyan.FFmpeg` (needed only for `worker`).
- **`gh auth` invalid**: Kabir runs `gh auth login` on the PC before any push.
- Python not needed for this stack; ignore the PATH alias issue.
- Repo at `C:\Users\Kabir\Documents\ChatGPT\beat stacks` is empty with no remote. Yellow was to initialize on GitHub; whoever creates it first, the other clones. Blue will drop `AGENTS.md`, `docs/ARCHITECTURE.md`, `infra/`, `shared` as the first commit.

## 5. First slice (go)

Red: migrations for `users/vaults/vault_members/folders/blobs/files/shares/audit_log` (SQL in `docs/ARCHITECTURE.md` §3), Better Auth email+password, personal vault created on signup, `GET /vaults`, folder CRUD.
Verification: `pnpm -F api test` + `curl` login → create folder → list.

Your marketplace slice (pack → preview → checkout → library → download) is parked unless Kabir picks that product.

## Blockers for Blue
- Kabir: Docker Desktop yes/no.
- Red: Hono or Fastify.
