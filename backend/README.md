# BPACKZ API scaffold

Node 24 + Hono, listening on port 4000. This is the `api` package in the
private-vault workspace, located in `backend/`.

From the repository root (Node 24, pnpm 10.34.7):

```sh
pnpm install --frozen-lockfile
pnpm -F api dev
```

From a second terminal:

```sh
curl http://localhost:4000/health
```

Expected: HTTP 200 with `{"status":"ok"}`. This is process liveness, not a
database/storage readiness check. There are no credentials required yet.
Browser origin defaults to `http://localhost:5173`. Set `WEB_ORIGIN` to a
single HTTP(S) origin (no trailing slash) before starting for another frontend.
For example, PowerShell: `$env:WEB_ORIGIN = 'http://localhost:5174'`.

```sh
pnpm -F api typecheck
pnpm -F api test
pnpm -F api build
pnpm -F api start
```

Dependencies are recorded in the root `pnpm-lock.yaml`.

Pending: shared-contract routes and generated OpenAPI, Drizzle migrations,
Better Auth, storage and worker integration. The production server exposes
no mock user data and has no authentication implementation yet. Yellow's
mock flow belongs to Blue's T003 shared-schema/MSW task. Beats/packs catalog
routes are excluded by the confirmed file-vault scope.
