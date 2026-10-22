# [FROM: BLUE] → [TO: YELLOW, RED, BRAIN] — T009 gap-check: Yellow's T023 feature list vs shared contract
2026-10-22
Status: done — no contract changes needed; PR #21 merged
Contract changes: none
Verification: every row of comms/yellow/T023-feature-list.md traced to a route in shared/src/api/*; code in PR #21 uses the shared client, so the names below are what actually runs
Next owner: YELLOW (fix the four route names in T023 doc on your next PR; no code change), RED (T016 waveforms, T017 members/shares/purge)

| # | Feature | Route(s) that back it | Verdict |
|---|---|---|---|
| 1 | Sign in/up/out, session | Better Auth at `/auth/*` (backend basePath), `auth.me` | OK. Doc says `/api/auth/*`; code correctly uses `/auth/*`. Fix the doc. |
| 2 | Personal + shared vaults | `vaults.list/create/get` | OK |
| 3 | Shared vault dropdown, collaborators, inline create | `vaults.list/create/members/invite` | OK. `invite`/`removeMember` are live in T017. |
| 4 | 3D folder grid, rap objects, Aston mic | `files.listChildren`, `folders.create/update/trash` | OK. Doc says `folders.patch`/`folders.remove`; the contract names are `update`/`trash`. Icon + colour slot per folder/vault lives in localStorage. |
| 5 | File cards with `FileItem.status` | `files.listChildren/get` | OK. Polling `files.get` until ready/failed matches ADR 0001. |
| 6 | Presigned multipart uploader | `uploads.create/sign/complete/abort` | OK. Doc says `POST .../parts` and `POST .../abort`; contract is `POST .../sign` and `DELETE /uploads/:id?key=`. Code is right. |
| 7 | Transport player + download | `files.downloadUrl` (inline) + `files.waveform` | OK. Waveform returns 404 until T016; UI already tolerates it. |
| 8 | Share sheet + share links + trash | `shares.create/list/revoke/resolve`, `files.trash`, "share to shared vault" = `files.update` with `toVaultId` | OK. Live in T017 (Red). |

## NEW items (not in the contract) and the call on each
- **Per-vault / per-folder UI metadata (icon slot, colour palette) persisted server-side.**
  Decision: **no, for now.** localStorage is fine for one device. The moment Kabir/Swish want
  the same look on phone and laptop, this becomes a 2-column `ui_meta JSONB` on `vaults` and
  `folders` plus a `PATCH` body field; ten-line change, no new route. Ask when it matters.
- Nothing else. Yellow built to the contract.

## What has to exist for T009-e2e (one `docker compose up`), tracked separately
- `backend/Dockerfile` (Red) and `frontend/Dockerfile` or static build served by the API (Yellow).
  Worker already has one and is wired in `infra/docker-compose.yml` with in-network hostnames.
- `WEB_ORIGIN`/`API_ORIGIN` in `.env` for the compose case; presigned URLs must point at a
  browser-reachable RustFS (`localhost:9000`), which is why the API keeps `S3_ENDPOINT=localhost`
  while the worker overrides it to `rustfs`.
