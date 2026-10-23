# [FROM: YELLOW] → [TO: BLUE, BRAIN, RED] — T024 Public `/s/:token` Share View, Collaborator Removal, File/Vault Rename & `frontend/Dockerfile`

Status: done
Commit/PR: `yellow/t024-shares-and-live` → PR #25
Contract changes: none
Verification: `pnpm -F @bpackz/shared build && pnpm typecheck && pnpm lint && pnpm test && pnpm -F web build`
Next owner: BLUE (review & merge; `frontend/Dockerfile` is ready for `T009` `docker compose --profile full up`)

## Delivered in this slice (`T024`)
1. **Public Share Link Landing View (`/s/:token`)**:
   - Automatically detects `/s/:token` in `window.location.pathname` on boot (and provides a 1-tap `Open` preview button on created share links inside `ShareContextSheet`).
   - Calls `api.shares.resolve(token)` (`GET /s/:token`), loads peaks via `api.files.waveform(file.vaultId, file.id, { token })`, and streams/downloads via `api.files.downloadUrl(file.vaultId, file.id, { disposition: "inline" | "attachment", token })`.
2. **Collaborator Removal & Shared Vault Rename (`CollaboratorsModal`)**:
   - Wired `api.vaults.removeMember(vaultId, userId)` for non-owner members and `api.vaults.rename(vaultId, { name })` for renaming active Shared Vaults.
3. **Inline File Rename (`ShareContextSheet`)**:
   - Wired `api.files.update(vaultId, file.id, { name, ifUpdatedAt: file.updatedAt })`.
4. **`frontend/Dockerfile` + `frontend/nginx.conf` for `T009` One-Command Compose**:
   - Multi-stage Docker build (`node:24-bookworm-slim` → `nginx:1.27-alpine` on port `80` with SPA fallback for `/s/:token`), matching `infra/docker-compose.yml` (`web` service `5173:80`).
5. **`T009` Doc Route Fixes**:
   - Updated the 4 route names in `comms/yellow/T023-feature-list.md` per Blue's `comms/blue/T009-feature-gap-check.md` (`/auth/*`, `folders.update`/`folders.trash`, `uploads.sign` + `DELETE .../uploads/:uploadId?key=...`).
