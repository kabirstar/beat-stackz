# [FROM: YELLOW] → [TO: BLUE, RED, BRAIN (Swish's PC Claude Agent)] — T027 Local Server Spin-Up & Cross-Device Sync Guide

Status: handoff / ready to run
Branch with latest UI (`VisionBoardCanvas` + `3D Jiggle Mode` + `PR #25` features): `origin/yellow/t025-bridge-and-autodispatch` (or `origin/main` + merge `origin/yellow/t025-bridge-and-autodispatch`)
Target: Swish's PC (`http://localhost:5173` web + `http://localhost:4000` api + Postgres 17 + RustFS S3)

---

## 1. Quick Copy-Paste Commands for Swish's Claude Agent (PC)

Run these commands from the repo root (`BPACKZ`) on Swish's PC to pull the latest UI + backend, spin up Postgres 17 & RustFS in Docker, migrate the DB, create the S3 bucket, and launch the live website:

```bash
# 1. Fetch latest branches and merge Yellow's latest UI branch into main (or check it out directly)
git fetch --all
git checkout yellow/t025-bridge-and-autodispatch
git pull origin yellow/t025-bridge-and-autodispatch

# 2. Ensure .env exists at the repo root
cp -n infra/.env.example .env

# 3. Start local Postgres 17 (:5432) and RustFS S3 (:9000 / :9001) in Docker
docker compose -f infra/docker-compose.yml up -d postgres rustfs

# 4. Install workspace dependencies & build the @bpackz/shared contract package
pnpm install
pnpm -F @bpackz/shared build

# 5. Run Postgres Drizzle migrations & initialize the RustFS "bpackz" S3 bucket
pnpm -F api db:migrate
pnpm -F api storage:setup

# 6. Start the live Backend API (:4000), Worker, and Frontend Web App (:5173 in live mode)
# Terminal A — Live API Server (Port 4000):
pnpm -F api dev

# Terminal B — Audio/Upload Worker:
pnpm -F worker dev

# Terminal C — Frontend Website connected to Live API (Port 5173):
pnpm -F web dev:live
```

> **Note on `dev:live` vs `dev:mock`:**
> - `pnpm -F web dev:live` sets `VITE_MOCK=false`, which points the React app at `http://localhost:4000`, auto-signs in / registers `swish@bpackz.studio`, and auto-seeds the default 6 root 3D folders (`beats`, `presets`, `vocals`, `songs`, `media`, `vision board`) + subfolders into Postgres on first load.
> - `pnpm -F web dev` (or `pnpm -F web dev:mock`) runs in standalone MSW mock mode (`VITE_MOCK=true`) if Docker is not running.

---

## 2. Do Documents & Files Save Between Both Devices If Both Run Locally?

### Short Answer
- **If both machines run separate `localhost` servers (`localhost` on Swish's PC and `localhost` on Kabir's Mac):** **No.** Each device writes to its own isolated Docker volumes (`pgdata` for Postgres and `blobs` for RustFS) on its own hard drive. Git syncs **code**, not local database rows or S3 audio blobs.
- **If Kabir's Mac connects to Swish's PC server over Tailscale (or LAN / Cloudflare Tunnel) — OR once deployed to Hetzner + R2:** **Yes, 100% live sync.** Because Swish's PC is already the always-on machine, both devices can share Swish's PC server with zero cloud cost right now.

### How to Make Both Devices Share the Same Saved Files Right Now (Tailscale — 2 Minutes)
1. Install **Tailscale** on Swish's PC and Kabir's Mac (same Tailnet) and note Swish's PC Tailscale IP (e.g. `100.x.y.z`).
2. On Swish's PC, update `.env`:
   ```env
   WEB_ORIGIN=http://100.x.y.z:5173
   API_ORIGIN=http://100.x.y.z:4000
   BETTER_AUTH_URL=http://100.x.y.z:4000
   S3_ENDPOINT=http://100.x.y.z:9000
   ```
3. Run Vite with `--host 0.0.0.0`:
   ```bash
   VITE_MOCK=false VITE_API_ORIGIN=http://100.x.y.z:4000 pnpm -F web dev:live -- --host 0.0.0.0
   ```
4. Now both Swish (on PC) and Kabir/Todo (on Mac at `http://100.x.y.z:5173`) hit the **exact same Postgres DB and RustFS S3 bucket**, so every uploaded track, folder, shared vault, invite, and share link saves and syncs between both devices immediately.

### What Saves in Postgres/S3 vs. Browser `localStorage` Right Now
| Data Type | Where It Saves (`dev:live`) | Syncs Across Devices When Sharing Server? |
|---|---|---|
| **Users, Vaults, Shared Vaults & Members** | Postgres (`users`, `vaults`, `vault_members`) | **Yes** |
| **Folders & Subfolders (`beats`, `vocals`, etc.)** | Postgres (`folders`) | **Yes** |
| **Uploaded Audio / Video / Preset Files** | RustFS S3 (`blobs`) + Postgres (`files`) | **Yes** |
| **Public Share Links (`/s/:token`) & 30-Day Trash** | Postgres (`shares`, `files.deleted_at`) | **Yes** |
| **Custom 3D Icon Color/Type & Jiggle Order** | Browser `localStorage` (`bpackz_the_vault_ui_meta_v2`) | Per-browser until Blue/Red add `ui_meta` column to `folders` |
| **Vision Board Sticky Notes & Song Pins** | Browser `localStorage` (`bpackz_the_vault_vision_boards_v1`) | Per-browser until Blue/Red add `vision_board_json` to `vaults` |
