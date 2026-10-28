# [FROM: YELLOW] → [TO: BRAIN, BLUE] — T032 "In Progress" Song Ecosystems & FL Studio Stem Auto-Router
Status: done
Commit/PR: yellow/t026b-vault-gate → PR #45
Contract changes: none (uses existing `folders.create`, `files.listChildren`, `files.update`, and `uploads.*` routes)
Verification: `pnpm -F web typecheck` (clean), `pnpm -F web test` (10/10 passed), `pnpm -F web build` (clean)
Blockers: none
Next owner: BLUE / BRAIN (review & merge PR #45, then trigger Coolify redeploy to release on `app.beatstackz.com`)

## Summary of Deliverable (Requested by Kabir)

1. **Dedicated "In Progress" Section (`frontend/src/components/InProgressSection.tsx`)**
   - Accessible from the top workspace bar (`In Progress` pill with active song count), the 3D `in progress` hardware icon on the Vault grid, and the mobile bottom thumb dock (`In Prog`).
   - Keeps every song in its own self-contained ecosystem (`in progress/<Song Title>/`) rather than spreading stems across global folders.

2. **Per-Song 6-Subfolder Ecosystem (`frontend/src/App.tsx` → `ensureInProgressSongEcosystem`)**
   - Every song created or imported under `in progress` automatically provisions 6 subfolders via `api.folders.create`:
     - `/beat` — Instrumental, 2-track, or drum/melody mixer stems
     - `/main` — Lead vocal takes (hooks, verses)
     - `/bg` — Background vocals, harmonies, doubles, and stacks
     - `/adlib` — Ad-libs, hype throws, and vocal FX
     - `/demo` — Rough reference bounce and `.flp` project file
     - `/mixed` — Producer mix revisions and final masters

3. **FL Studio Split-Mixer Folder, `.zip`, & Stem Batch Auto-Router (`frontend/src/utils/inProgressAutoRouter.ts`)**
   - Supports dragging & dropping an exported FL Studio folder (`webkitGetAsEntry`), picking a folder (`webkitdirectory`), unpacking `.zip` loop packages / stem archives directly in the browser (`DecompressionStream("deflate-raw")` + `STORE`), or selecting multiple `.wav`/`.mp3`/`.flac`/`.aiff`/`.flp` files.
   - Automatically infers the song title from the dropped folder name, `.zip` archive name, `.flp` filename, or shared stem prefix when the song title input is left blank.
   - Routes each file into `/beat`, `/main`, `/bg`, `/adlib`, `/demo`, or `/mixed` via `classifyFlStudioStem` and displays a live routing summary receipt.
   - Includes 1-click per-file subfolder re-routing (`files.update`), inline waveform playback, direct per-bucket upload (`+ Add MIXED`, `+ Add DEMO`, etc.), and a `⚡ Test FL Auto-Sort` demo session generator.
