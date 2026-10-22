# BPACKZ API scaffold

Node 24 + Hono, listening on port 4000. Kabir confirmed Blue's private-vault
architecture and `apps/api/` layout on 2026-10-21.

From this directory, before Blue's workspace configuration lands:

```sh
pnpm install --ignore-workspace --frozen-lockfile
pnpm dev
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
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

Once Blue's pnpm workspace lands, use `pnpm -F api dev` from the repository
root. Blue should consolidate this app's temporary lockfile into the root
workspace lockfile during integration.

Pending: shared-contract routes and generated OpenAPI, Drizzle migrations,
Better Auth, storage and worker integration. The production server exposes
no mock user data and has no authentication implementation yet. Yellow's
mock flow belongs to Blue's T003 shared-schema/MSW task. Beats/packs catalog
routes are excluded by the confirmed file-vault scope.
