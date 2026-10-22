# [FROM: YELLOW] → [TO: BRAIN, BLUE, RED] — T020–T022 Final UI Design, Reusable Component Refactor & Codebase Efficiency Audit Request
Status: done (on mocks; ready for BRAIN code audit & T012/T013 backend wiring)
Commit/PR: `yellow/t020-t021-vault-ui`
Contract changes: none (consumes `@bpackz/shared` strictly via `frontend/src/api/client.ts`)
Verification: `pnpm -F web typecheck && pnpm -F web test && pnpm -F web build && pnpm lint`
Blockers: Waiting on Red's `T012` (vaults/folders/files CRUD) and `T013` (presigned multipart S3/RustFS routes) to switch from `VITE_MOCK=true` to live API
Next owner: **BRAIN** (audit codebase for efficiency/bloat + delegate remaining backend/worker/live-integration work to RED, BLUE, YELLOW)

## 1. What Has Already Been Built (Codebase Status Check)

### Shared & Infra (`BLUE` — Complete on `main`)
- `T001`: `@bpackz/shared` Zod schemas & route contracts (`auth`, `vaults`, `folders`, `files`, `uploads`, `shares`), `docs/ARCHITECTURE.md`, `infra/docker-compose.yml` (Postgres 17 + RustFS).
- `T002`: GitHub Actions CI (`typecheck`, `lint`, `test`, `@bpackz/shared` build, OpenAPI drift check, `db:check`).
- `T003`: `@bpackz/shared/mocks` MSW handlers + seeded store.
- `T004`: `brain/brain.py` coordinator loop + `.claude/agents/brain.md` + delegation/spawn skills.

### Backend (`RED` — Auth & Personal Vault Done; CRUD & Uploads Next)
- `T010a` / `T010b` (Merged in PR #1, #7): Hono API on `:4000`, Drizzle ORM, Better Auth email/password session cookies, transactional `audit_log` triggers.
- `T011` / `T014` (Merged in PR #8): Atomic personal vault provisioning on signup, `GET /me` returning `personalVaultId`, verified against Docker Postgres 17.11 + RustFS.
- **Still to build (`RED`)**:
  - `T012`: Vaults (`list`, `create`, `get`, `rename`, `members`, `invite`, `removeMember`), Folders (`create`, `get`, `update`, `trash`), and Files (`listChildren`, `get`, `update`, `trash`, `waveform`) routes in `backend/`.
  - `T013`: Presigned S3 multipart upload routes (`create`, `sign`, `complete`, `abort`) + 5-minute presigned `GET` download/stream URL against RustFS/R2.
  - `worker/`: Audio waveform JSON (`audiowaveform` / `ffmpeg`) job processor.

### Frontend (`YELLOW` — Built & Refactored into Reusable Components on `yellow/t020-t021-vault-ui`)
- **Finalized UI Design ("The Vault")**:
  - **Typography Locked**:
    - Page & Folder Display Headings: **Fontshare #5 — `Panchang` Wide + `Satoshi`** (`data-font-pair="panchang"`).
    - File Section Typography: **Studio Mono (`Azeret Mono` / `SF Mono` / `JetBrains Mono`)** (`data-file-font="mono"`), with `parseStudioFileDisplay()` converting raw filenames (`swish_142bpm_dark_loop.wav`) into clean titles (`Swish 142bpm Dark Loop`) + hardware format badges (`WAV`, `FXP`, `MP4`) + separated tabular-num spec pills.
  - **3D Spawning Studio & Shared Vault Rap Object Icons (`frontend/src/HardwareIcons.tsx`)**:
    - **Personal Vaults (`Swish` & `Todo`)**: Root folders & subfolders spawn with staggered 3D spring physics (`objectSpawn`) and bespoke studio hardware rigs: `beats` (16-pad MPC sampler), `presets` (rotary synth knobs + faders), `vocals` (minimalistic 3D **Aston Spirit** condenser mic with flat-topped wave-spring cage, glowing internal capsule, 3 top switches & diamond badge matching the active vault color scheme), `songs` (spinning dual-reel master tape deck), `media` (standalone 3D cinema camera, clapperboard, vinyl sleeve).
    - **Shared Vaults (Main Page Only)**: The 5 Level-1 root folders on the Shared Vault main page render multi-plane 3D Rap Object Models in their authentic object colors (`beats` → `rap_cup` 3D Double Styrofoam Lean Cup with purple syrup & ice cubes, `presets` → `rap_chain` 3D Iced-Out VVS Diamond Cuban Link Chain & Medallion, `vocals` → `rap_money` 3D `$100K` US Dollar Cash Stack, `songs` → `rap_lambo` 3D Verde Mantis Lambo Supercar with spinning forged gold rims, `media` → `rap_watch` 3D Bust-Down Rose Gold & Tiffany Blue Royal Oak Chronograph Watch), while all subfolders and navigation bar icons keep the studio icons.
  - **Top Shared Vaults Dropdown (`frontend/src/components/VaultHeader.tsx`)**:
    - Clicking the Shared button at the top opens a dropdown listing all Shared Vaults with collaborator badges (`Swish · Todo`), each vault's saved random color swatch, an `Active` indicator, member management button, and an inline `+ Create` input to spin up new Shared Vaults.
  - **Separated Tactile File Cards & Mobile-First Navigation (`frontend/src/components/StudioFileSection.tsx`)**:
    - Eliminated the generic AI-coded `divide-y` table box. Each file is a standalone tactile `.file-card` with a 4px color-coded hardware spine matching its parent 3D folder, an always-visible **44×44px hardware play tile** (no hover required on mobile), separated spec pills, interactive mini-waveform strip, and a `Cards` vs `2-Col Grid` toggle.
    - Added a **1-Tap Mobile Subfolder Pill Switcher** at the top of the Files view so mobile users can jump between `All [Folder]`, subfolders, and `+ Subfolder` with one thumb tap.
  - **User & Shared Vault Color Themes (`frontend/src/vaultTheme.ts`)**:
    - **Swish**: Fixed Stealth Obsidian Black & Crimson Red hardware palette.
    - **Todo**: Fixed Chalk White & Matte Carbon Monochrome hardware palette.
    - **Shared Vaults**: Each Shared Vault generates and persists its own unique 5-slot studio hardware color scheme.

## 2. Reusable Component Refactor & Anti-Bloat Cleanup (`frontend/src/`)

To avoid code duplication and bloat, we refactored `frontend/src/App.tsx` (reducing it from **2,687 lines to ~610 lines** — a **77% reduction** in `App.tsx`) and extracted reusable modules:
- `frontend/src/components/StudioPrimitives.tsx`:
  - `StudioModal`: Single reusable modal/bottom-sheet shell replacing **5 duplicated modal wrappers**.
  - `StudioIcon`: Single reusable vector icon registry (`23` studio icons) replacing **30+ copy-pasted inline `<svg>` blocks**.
  - `HardwareGridSection`: Single reusable 3D hardware icon grid used for both Level 1 (Root folders) and Level 2 (Subfolders).
- `frontend/src/components/VaultHeader.tsx`: Reusable top bar, top folder icon dock, search bar, profile/vault switchers, and sticky mobile breadcrumb bar.
- `frontend/src/components/StudioFileSection.tsx`: Reusable `StudioFileCard` (shared between Folder view and Global Search results), `StudioFileSection`, and `TrashSection`.
- `frontend/src/components/VaultModals.tsx`: `PlusActionMenu`, `ShareContextSheet` (Apple AirDrop / Spotify style), `CreateFolderModal`, `CreateSharedVaultModal`, `CollaboratorsModal`, and `AuthModal`.
- `frontend/src/components/BottomTransportPlayer.tsx`: Persistent bottom waveform & transport bar.
- `frontend/src/utils/format.ts`: Consolidated `formatBytes`, `parseStudioFileDisplay`, and `computeDeterministicSha256` (removed duplicate definitions in `App.tsx` and unused template helpers).

## 3. Request for BRAIN: Codebase Efficiency Audit & Task Delegation

1. **Codebase Efficiency & Anti-Bloat Audit**:
   - Please review and audit `frontend/src/**`, `backend/src/**`, and `shared/src/**` to verify there is zero dead code, minimal bundle/runtime overhead, no duplicate helpers, and strict adherence to `@bpackz/shared` contracts.
2. **Delegate Remaining Build Tasks**:
   - **RED (`T012` & `T013`)**: Implement the remaining `/vaults`, `/folders`, `/files`, `/uploads`, and `/shares` routes in `backend/` so `frontend/` can switch from `VITE_MOCK=true` to live backend + RustFS.
   - **BLUE**: Review Yellow's `T020–T021` branch (`yellow/t020-t021-vault-ui`) and Red's upcoming `T012`/`T013` PRs; advise if folder UI metadata (`iconKey`, `colorSlot`, `description`) should remain client-side or be added as optional fields in `@bpackz/shared` `Folder`.
   - **YELLOW (`T022` Live Wiring)**: Connect real `<audio>` streaming against `files.downloadUrl` (`disposition: "inline"`) and verify end-to-end multipart uploads against Red's `T013` endpoints.
