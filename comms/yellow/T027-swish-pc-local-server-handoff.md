# Beat Stackz (`BPACKZ`) — Complete Context & From-Scratch Runbook for Swish's Claude Agent

> **Give this entire `.md` file to Swish's Claude agent on the PC.** It contains full project context, repository layout, multi-agent ownership rules, exact commands to spin up the app from scratch (Docker + Postgres 17 + RustFS S3 + Hono API + React 19 UI), cross-device sync setup, and the remaining backend tasks.

---

## 1. What Beat Stackz (`BPACKZ`) Is

**Beat Stackz ("The Vault")** is a collaborative studio file vault for artists and producers (**Swish** and **Todo / Kabir**):
- **Private Personal Vaults**: Each user has a private studio space with their own signature 3D hardware palette:
  - **Swish**: Stealth Matte Obsidian Black chassis with Crimson Red studio accents (`SWISH_PALETTE`).
  - **Todo**: Architectural Chalk White & Matte Carbon Monochrome hardware (`TODO_PALETTE`).
- **Shared Collab Vaults (`Swish × Todo`)**: Google-Drive-style co-owned vaults (`owner` / `editor` / `viewer`) with a 5-slot rainbow main screen (`SHARED_MAIN_PALETTE`) and persistent randomized HSL hardware palettes for subfolders.
- **3D Studio Hardware Folder Taxonomy**:
  - Instead of generic folders, every root category and subfolder renders as a **bespoke CSS 3D animated studio or rap-culture object** (`beats` MPC Drum Sampler, `presets` Synth Rotary Knobs, `vocals` Aston Spirit Condenser Mic with pop filter & shockmount, `songs` Twin Open-Reel Master Tape, `media` Cinema Camera, `vision board` 3D Studio Moodboard, plus 15 custom 3D icons like Diamond Grillz, Cuban Link Chain, Roland TR-808, Lamborghini Huracán, Goyard Trunk, Twin Turntables, etc.).
  - **iOS-Style Hold-and-Drag Jiggle Mode**: Users can press-and-hold (or drag) any 3D folder icon to enter Jiggle Mode and rearrange their folders on the main screen or inside subfolders.
- **Collab Vault Vision Board**:
  - Clicking the `vision board` 3D icon opens a **Figma-style infinite pan/zoom dotted-grid canvas** (`55%`–`165%` zoom) where collaborators can drop & drag **Sticky Notes** (`Canary`, `Coral`, `Mint`, `Lavender`), pin existing vault songs or upload new songs directly onto the board, play audio inline, and leave **threaded timestamped comments** on each song card.
- **Separated Studio Track Cards & Bottom Transport Player**:
  - Locked typography: **Panchang Wide + Satoshi** for display/folder headings (`data-font-pair="panchang"`) and **Studio Mono** for file titles (`data-file-font="mono"`).
  - Separated tactile cards with parent-folder color spines, `44×44px` mobile play tiles, format badges (`WAV`, `MP3`, `FXP`, `MOV`), interactive mini-waveforms, Apple/Spotify-style Share Sheet (`/s/:token` public share links + 1-tap send to Shared Vault), and 30-day soft-delete Trash recovery.
- **Scope Rule (`AGENTS.md`)**: File vault and studio collaboration only. **No payments, no marketplace, no public catalog.**

---

## 2. Monorepo Stack & Team Ownership (`AGENTS.md`)

| Layer | Tech Stack | Directory | Owner Agent |
|---|---|---|---|
| **Monorepo** | `pnpm` workspaces + Turborepo (Node >= 24) | Root | **Blue** (Claude on PC) |
| **Shared Contract** | Zod route contracts + generated TS API client + OpenAPI | `shared/**` | **Blue** (Claude on PC) |
| **Infra & Docs** | Docker Compose (`postgres:17`, `rustfs/rustfs`), CI, ADRs | `infra/**`, `docs/**` | **Blue** (Claude on PC) |
| **BRAIN Loop** | Discord orchestrator (`#beat-stackz-hq`) + `.claude/agents` | `brain/**`, `comms/brain/**` | **BRAIN / Blue** (PC) |
| **Backend API** | Hono on Node 24 (`:4000`) + Drizzle ORM + Better Auth + AWS SDK v3 S3 | `backend/**` | **Red** (Astra / Claude on PC) |
| **Background Worker** | Upload verification (`SHA-256` / magic bytes) + `ffmpeg` / `audiowaveform` | `worker/**` | **Red** (Astra / Claude on PC) |
| **Frontend Web App** | Vite + React 19 + TypeScript + Tailwind v4 (`:5173`) | `frontend/**` | **Yellow** (Antigravity on Mac) |

### Key Architectural Rules
1. **The API Contract is the Handoff (`shared/src/api/*.ts`)**: Every route is defined as a Zod request/response pair in `@bpackz/shared`. Backend validates with it; Frontend calls the typed `createClient()` from `@bpackz/shared`.
2. **API Never Proxies File Bytes**: Uploads use presigned S3 multipart URLs (`64 MiB` parts, browser -> RustFS/R2 bucket). Downloads and audio streaming use 5-minute presigned S3 `GET` URLs.
3. **Security & Audit Log**: Every file/folder route checks vault membership (`vault_members`), uses soft delete (`deleted_at` with 30-day purge), and writes an `audit_log` row in the same DB transaction.
4. **Git Worktrees on the PC**: If Blue, Red, and BRAIN run on the same PC, each works in its own git worktree (`../bpackz-red`, `../bpackz-brain`, and root checkout for Blue) so branches never collide.

---

## 3. How to Run Beat Stackz From Scratch on Swish's PC

### Prerequisites on Swish's PC
1. **Git**
2. **Node.js 24+** (`node -v` should show `v24.x.x`)
3. **pnpm 10+** (`corepack enable && corepack prepare pnpm@10.34.7 --activate` or `npm i -g pnpm`)
4. **Docker Desktop** (must be running for Postgres 17 + RustFS S3)

---

### Step-by-Step Setup (Copy & Run in Terminal)

#### Step 1: Clone the Repo & Checkout the Latest Branch
If the repo is not cloned yet:
```bash
git clone https://github.com/kabirstar/beat-stackz.git BPACKZ
cd BPACKZ
```
If the repo is already cloned on Swish's PC, pull the latest changes and merge Yellow's latest UI branch (`origin/yellow/t025-bridge-and-autodispatch`) into your working branch:
```bash
git fetch --all
git checkout yellow/t025-bridge-and-autodispatch
git pull origin yellow/t025-bridge-and-autodispatch
```
*(Or if on `main`: `git checkout main && git pull origin main && git merge origin/yellow/t025-bridge-and-autodispatch`)*

#### Step 2: Create `.env` at the Repo Root
```bash
cp -n infra/.env.example .env
```
Verify `.env` contains:
```env
DATABASE_URL=postgres://bpackz:bpackz@localhost:5432/bpackz

S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=bpackz
S3_ACCESS_KEY=bpackz
S3_SECRET_KEY=bpackz-secret
S3_FORCE_PATH_STYLE=true

BETTER_AUTH_SECRET=change-me-32-chars-minimum-random-string
BETTER_AUTH_URL=http://localhost:4000

WEB_ORIGIN=http://localhost:5173
API_ORIGIN=http://localhost:4000
```

#### Step 3: Start Postgres 17 (`:5432`) and RustFS S3 (`:9000` / `:9001`) in Docker
```bash
docker compose -f infra/docker-compose.yml up -d postgres rustfs
```
Wait ~5 seconds for `postgres` to report healthy (`docker compose -f infra/docker-compose.yml ps`).

#### Step 4: Install Dependencies & Build `@bpackz/shared`
```bash
pnpm install
pnpm -F @bpackz/shared build
```

#### Step 5: Run Postgres Database Migrations & Initialize the S3 Bucket
```bash
pnpm -F api db:migrate
pnpm -F api storage:setup
```

#### Step 6: Launch the Live Stack
Open 3 terminals (or run via background tasks):

- **Terminal 1 — Backend API (`http://localhost:4000`)**:
  ```bash
  pnpm -F api dev
  ```
- **Terminal 2 — Background Upload/Audio Worker**:
  ```bash
  pnpm -F worker dev
  ```
- **Terminal 3 — Frontend Web App in Live API Mode (`http://localhost:5173`)**:
  ```bash
  pnpm -F web dev:live
  ```
  Now open **`http://localhost:5173`** in your browser!

> **Want to preview the UI immediately without Docker running?**
> Run `pnpm -F web dev:mock` (or `pnpm -F web dev`). This launches the frontend on `http://localhost:5173` backed by Mock Service Worker (`frontend/src/mocks/handlers.ts`) pre-loaded with Swish & Todo vaults, sample tracks, 3D folders, and the Vision Board.

---

## 4. How Cross-Device Saving Works (Swish's PC <-> Kabir's Mac)

### Why Two Separate `localhost` Servers Don't Share Data Automatically
- When Swish runs `localhost` on his PC and Kabir runs `localhost` on his Mac, each computer writes to its own local Docker volumes (`pgdata` + `blobs`). GitHub only syncs **source code**, not database rows or uploaded audio files.

### How to Make Documents & Songs Save Across Both Devices Right Now (Tailscale — Free, 2 Mins)
Since Swish's PC is running the local server (`postgres`, `rustfs`, `api`, `web`), both machines can share Swish's PC server over **Tailscale** (or local Wi-Fi):

1. Install **Tailscale** on both Swish's PC and Kabir's Mac (signed into the same Tailnet) and copy Swish's PC Tailscale IP (e.g. `100.x.y.z`).
2. On Swish's PC, update `.env` so presigned S3 URLs and CORS accept the Tailscale IP:
   ```env
   WEB_ORIGIN=http://100.x.y.z:5173
   API_ORIGIN=http://100.x.y.z:4000
   BETTER_AUTH_URL=http://100.x.y.z:4000
   S3_ENDPOINT=http://100.x.y.z:9000
   ```
3. Restart `pnpm -F api dev`, and start the frontend exposed on all interfaces:
   ```bash
   VITE_MOCK=false VITE_API_ORIGIN=http://100.x.y.z:4000 pnpm -F web dev:live -- --host 0.0.0.0
   ```
4. Kabir opens `http://100.x.y.z:5173` on his Mac, and Swish opens `http://100.x.y.z:5173` on his PC. Both devices now read and write to the **exact same Postgres database and RustFS S3 bucket**!

---

## 5. Current Frontend Architecture (`frontend/src/`)

Yellow refactored the frontend into clean, modular components with zero duplication:

- `frontend/src/App.tsx`: Main state orchestrator, live API / MSW session bootstrap, default vault folder taxonomy seeding, and keyboard/navigation handlers.
- `frontend/src/HardwareIcons.tsx`: 22 sculpted CSS 3D animated studio hardware & rap culture icons (`HardwareObject3D`, `RecordHardwareItem`, `MiniFolderSvg`).
- `frontend/src/vaultTheme.ts`: Theme palettes (`SWISH_PALETTE`, `TODO_PALETTE`, `SHARED_MAIN_PALETTE`, `generateRandomSharedPalette`) + Vision Board state types (`VisionBoardNote`, `VisionBoardFileNode`, `VisionBoardVaultState`).
- `frontend/src/components/StudioPrimitives.tsx`: `UserAvatarBadge`, `CollaboratorAvatarStack`, and `HardwareGridSection` (with iOS hold-and-drag 3D icon `jiggleMode` reordering).
- `frontend/src/components/VaultHeader.tsx`: Sticky studio header, Back/Home navigation, top folder icon dock, Shared Vaults dropdown menu, search input, profile switchers (`S` / `T`), and `+` creation menu.
- `frontend/src/components/StudioFileSection.tsx`: Separated tactile `StudioTrackCard` rows/grid, mobile subfolder pill bar, collaborator filter chips, and 30-day Trash recovery view.
- `frontend/src/components/VaultModals.tsx`: Apple/Spotify Share & Context Sheet (`SharePopoverModal`), Collaborators & Invites modal (`MembersModal`), New 3D Folder modal (`CreateFolderModal`), and New Shared Vault modal (`CreateSharedVaultModal`).
- `frontend/src/components/BottomTransportPlayer.tsx`: Persistent bottom audio player with live HTML5 `<audio>` streaming, interactive waveform scrubber, and loop toggle.
- `frontend/src/components/VisionBoardCanvas.tsx`: Figma-style infinite pan/zoom dotted-grid canvas with draggable sticky notes, pinned/uploaded song cards, inline audio preview, and threaded timestamped comments.

---

## 6. Discord Communication Bridge & Multi-Agent Task Setup

Swish's Claude agent can directly read and post to the team's Discord channels (`#beat-stackz-hq` and `#brain-updates`), coordinate with **BRAIN**, **Yellow**, **Blue**, and **Red**, and pick up or delegate work via `TASKS.md` and `comms/`.

### A. Discord Channels & Human Authority
- **`#beat-stackz-hq`**: Main multi-agent engineering channel where humans (**Kabir/Todo** and **Swish**) and agents (**BRAIN**, **Yellow**, **Blue**, **Red**) communicate.
- **`#brain-updates`**: Plain-English milestone channel for Kabir and Swish only (posted automatically by `brain/brain.py` whenever a reply includes `---UPDATE---`).
- **Recognized Humans (Equal Authority)**:
  - **Kabir (Todo / Lush)**: Discord username `prodbylush808`
  - **Swish**: Discord username `mysterious_cheetah_19465`

### B. Required Discord Keys in `.env` (Never Commit `.env`)
Ensure the root `.env` on Swish's PC includes the Discord credentials (ask Kabir if you need the token/webhook values copied into `.env`):
```env
DISCORD_BOT_TOKEN=<discord-bot-token>
DISCORD_CHANNEL_ID=<beat-stackz-hq-channel-id>
DISCORD_WEBHOOK_URL=<beat-stackz-hq-webhook-url>
DISCORD_UPDATES_WEBHOOK_URL=<brain-updates-webhook-url>
```
*(One-time helper to create `#brain-updates` + its webhook if not yet created: `py brain/setup_updates.py`)*

### C. Using the 2-Way Discord Bridge (`comms/yellow/discord_bridge.py`)
Any agent (`BLUE`, `RED`, `YELLOW`, `BRAIN`) can read or post to `#beat-stackz-hq` using `comms/yellow/discord_bridge.py`:

```bash
# 1. Read the latest messages in #beat-stackz-hq
python3 comms/yellow/discord_bridge.py read

# 2. Check only new unread messages since last poll
python3 comms/yellow/discord_bridge.py poll

# 3. Block and wait until a new message arrives for your agent (used by background loops)
python3 comms/yellow/discord_bridge.py wait BLUE

# 4. Post a message to #beat-stackz-hq as BLUE, RED, YELLOW, or BRAIN
python3 comms/yellow/discord_bridge.py send BLUE "PR #25 merged and local server is up on :4000"
```

### D. Running the `BRAIN` Coordinator Loop on the PC (`brain/brain.py`)
**BRAIN** (`.claude/agents/brain.md`) is the front-door orchestrator on the PC:
- **Start the continuous Discord listener**:
  ```bash
  py brain/brain.py
  ```
- **Test a single question without waiting on Discord**:
  ```bash
  py brain/brain.py --once "What is everyone working on right now?"
  ```
- **How `brain.py` isolates its workspace**:
  - `brain/brain.py` automatically creates and uses its own git worktree at `../bpackz-brain` on branch `brain-main` (synced to `origin/main` before every turn and copying `.env` + `.claude/settings.local.json` from the root repo).
  - Red also runs in its own git worktree (`git worktree add ../bpackz-red red/<topic>`), while Blue uses the main checkout (`BPACKZ`), so agents on the same PC never overwrite each other's working trees.
- **How BRAIN delegates & learns (`.claude/skills/`)**:
  - `.claude/skills/brain-delegate/SKILL.md`: Writes `comms/brain/<task-id>-<slug>.md`, updates `## BRAIN` in `TASKS.md`, and pings the target agent in `#beat-stackz-hq`.
  - `.claude/skills/brain-spawn-agent/SKILL.md`: Spins up purpose-built subagents under `.claude/agents/<name>.md` and records dated lessons in `.claude/skills/<name>/SKILL.md`.

### E. How `TASKS.md` and `comms/` Handoffs Work
To prevent merge conflicts across agents working in parallel:

1. **`TASKS.md` (One Section Per Owner)**:
   - Sections: `## KABIR & SWISH`, `## BLUE`, `## RED`, `## YELLOW`, `## BRAIN`.
   - **Rule**: Only edit your own agent's section in `TASKS.md`.
   - **Format**:
     ```markdown
     - [ ] T017 [RED] vault members + share links + trash purge per shared contract
           paths: backend/**, worker/**  depends: T013
           deliverable: vaults.members/invite/removeMember; shares.*; 30-day purge job
           verify: pnpm -F api test
     ```

2. **`comms/<sender>/<task-id>-<slug>.md` (One Handoff File Per Task)**:
   - **Rule**: Never edit a shared log file (`COMMS_LOG.md` is legacy/read-only to avoid git conflicts). Always create a new file inside **your own color folder** (`comms/blue/`, `comms/red/`, `comms/yellow/`, or `comms/brain/`).
   - **Format**:
     ```markdown
     # [FROM: BLUE] → [TO: RED, YELLOW] — T027 Local Server & Vision Board Persistence
     Status: done | blocked | question
     Commit/PR: blue/vision-board-schema → PR #26
     Contract changes: none | describe
     Verification: `pnpm -F @bpackz/shared test` → passed
     Blockers: none
     Next owner: RED (implement migration)
     ```
   - After pushing your branch and handoff file, post a 1-line ping in `#beat-stackz-hq` via `python3 comms/yellow/discord_bridge.py send <COLOR> "<summary>"`.

---

## 7. Next Tasks for Swish's Claude Agent (Blue & Red on PC)

1. **Merge `origin/yellow/t025-bridge-and-autodispatch` into `main` & Spin Up the Local Stack**:
   - Run CI checks (`pnpm typecheck && pnpm lint && pnpm test && pnpm -F @bpackz/shared build`), merge Yellow's branch, and start Postgres + RustFS + API (`:4000`) + Web (`:5173`) using Section 3 above.
2. **Review & Complete Open Backend Tasks in `TASKS.md`**:
   - **PR #23 (`T015` [RED] Verification Worker)**: Blue review & merge Red's upload hash/magic-byte verification worker (`red/worker`).
   - **`T017` [RED] Vault Members + Share Links + 30-Day Trash Purge**: Complete backend routes for `vaults.members`, `vaults.invite`, `vaults.removeMember`, `shares.*`, `?token=` on download/waveform, and the 30-day purge job.
3. **Apply `T025` Auto-Dispatch Upgrade to `brain/brain.py` (`comms/yellow/T025-brain-auto-dispatch-pc.md`)**:
   - Update `brain/brain.py` so when BRAIN outputs `→ BLUE:` or `→ RED:` delegations in `#beat-stackz-hq`, `brain.py` automatically spawns a non-interactive `claude -p --permission-mode acceptEdits` worker in Blue's (`ROOT`) or Red's (`../bpackz-red`) worktree on the PC.
4. **Persist Vision Board & Custom 3D Icon Metadata in Postgres (Optional Enhancement)**:
   - Add a JSONB metadata column on `vaults` / `folders` so Vision Board sticky notes/song pins (`VisionBoardVaultState`) and custom 3D icon colors/jiggle sort order (`FolderUiMeta`) sync across devices via Postgres alongside files and folders.
