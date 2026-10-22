# [FROM: RED] -> [TO: YELLOW, BLUE] — T010 API scaffold

Status: scaffold verified; integration pending
Commit/PR: red/api-scaffold
Contract changes: none; /health is a process-liveness endpoint

## Delivered

- `apps/api/`: Hono 4.13.13, @hono/node-server 2.1.5, Node 24 native TypeScript
  execution for development, TypeScript 5.9.3 compilation for production.
- GET `/health` on port 4000 returns HTTP 200 with `{"status":"ok"}`.
- CORS permits the configured `WEB_ORIGIN`; default `http://localhost:5173`.
- No secrets, database or storage required to run the scaffold.
- Standalone lockfile and run instructions in `apps/api/README.md`.

## Verification

- `pnpm --dir apps/api test`: 4 passed (liveness, browser origin/preflight,
  invalid origin configuration, unimplemented routes).
- `pnpm --dir apps/api typecheck`: passed.
- `pnpm --dir apps/api build`: passed.
- `pnpm --dir apps/api dev`: booted and announced port 4000; stopped after check.
- Compiled server: actual HTTP GET /health returned 200 and the configured
  Access-Control-Allow-Origin header; stopped after check.
- GitHub CLI authentication is valid outside the restricted network sandbox.

## Integration boundaries

Kabir explicitly chose Blue's private-vault scope and `apps/api/` layout.
No `/api/beats`, `/api/packs`, marketplace, payments or public catalog.
Blue's local draft uses Postgres 17, Drizzle, Better Auth, S3 and a worker.
Those are subsequent integrations, not working features of this scaffold.
T010's full Drizzle/Better Auth acceptance is not marked complete.

The remote base is d818cc4, which still has the old root instructions and
layout. Blue's new workspace/contracts exist in his local working tree but
were not published when this scaffold was prepared. No uncommitted Blue
files were copied into this branch. Root scripts/CI, shared-schema mocks,
OpenAPI generation and DB migration/drift checks have not run here.

## Next actions

1. BLUE publishes the canonical workspace and shared contracts, reconciles
   root instructions/tasks, and reviews this branch. Hono is Red's choice.
2. BLUE consolidates `apps/api/pnpm-lock.yaml` into the root pnpm lockfile
   during workspace integration and removes the app lockfile then.
3. YELLOW can verify API reachability using /health; use Blue's T003 mocks for
   vault UI until the authenticated API slice lands.
4. RED integrates the shared validators, auth and Drizzle on the agreed schema.
   Local Postgres is required for meaningful auth/migration integration tests.
5. KABIR merges after review.

PC workspace note: Red cloned inside `beat stacks/red-checkout/`. An initial
pnpm add discovered the parent workspace and wrote its lockfile with a
`red-checkout/apps/api` importer. Blue was notified locally in
`comms/red/T010-scaffold-status.md`; regenerate the parent lockfile from its
actual workspace and exclude the nested clone from staging. Subsequent Red
installation used `--ignore-workspace` and created an app-local lockfile.
