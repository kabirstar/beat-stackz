# [FROM: YELLOW] → [TO: BRAIN, BLUE, RED] — T030 Artist (Swish) × Producer (Todo) Full Feature QA Report & Improvements
2026-10-23
Status: done (all frontend QA bugs fixed on `yellow/t026b-vault-gate`; cross-team improvements proposed below)
Commit/PR: `yellow/t026b-vault-gate` → PR #45 (includes all Blue T043 review fixes + T078 + QA bug fixes)
Contract changes: proposed below for Blue (`trash.list`/`restore`, `visionBoard` state sync, pending invite links `/i/:token`)
Verification: `pnpm -F @bpackz/shared build && pnpm -F web typecheck && pnpm -F web test && pnpm lint && pnpm -F web build` → 9/9 tests pass, 0 lint errors, production build clean; live R2 CORS (`OPTIONS` 204 + `PUT` 200 + worker waveform verify) verified against `api.beatstackz.com`
Next owner: BRAIN / BLUE (review & merge PR #45, redeploy Coolify on `app.beatstackz.com`, evaluate proposed contract additions)

---

## 1. Executive Summary of Swish (Artist) × Todo (Producer) Multi-Agent QA (`F01–F21`)
Per Kabir's request, Yellow ran two specialized QA subagents — **Artist QA Agent (Swish)** (`F01–F04`, `F06–F16`) and **Producer QA Agent (Todo)** (`F05`, `F17–F21`) — testing every feature against both our local branch and the live hosted deployment (`https://app.beatstackz.com` / `https://api.beatstackz.com`).

### What Passed End-to-End on Live Hosted (`api.beatstackz.com` + Cloudflare R2)
- **Auth & Personal Vault Provisioning (`F03–F06`)**: `POST /auth/sign-up/email` and `POST /auth/sign-in/email` set `HttpOnly` cookies, provision personal vaults, and seed all **5 root folders + 13 subfolders** (`18` total with exact `folder.kind` values from ADR 0002).
- **Presigned Multipart Upload + R2 Browser CORS + Worker Verification (`F11–F12`)**: Browser `OPTIONS` preflight from `Origin: https://app.beatstackz.com` to R2 returns `204` (`access-control-allow-origin: https://app.beatstackz.com`, `allow-methods: GET, PUT, HEAD`), `PUT` exposes `ETag`, `uploads.complete` triggers the worker, and `files.get` transitions from `processing` → `ready` with 64 waveform peaks and `durationMs` in ~3.5s.
- **Public Share Links (`F21`)**: Creating `24h`/`7d`/`30d` links (`POST /shares`), resolving `/s/:token`, streaming inline audio/waveform with `?token=`, and revoking (`DELETE /shares/:id` → `204`) all work end-to-end.

---

## 2. Frontend Bugs Caught & Fixed by Yellow in This Commit (`yellow/t026b-vault-gate`)
1. **Blue's T043 Review Blockers & Nits (100% Resolved)**:
   - Removed hardcoded auto-login in `bootstrapSession` and removed all demo credentials from `VaultGateScreen` / `handleSignOut`.
   - Removed the client-side 19-folder seeding loop in `loadVaultContents` (`App.tsx`) and reverted `DEFAULT_VAULT_TAXONOMY` in `frontend/src/mocks/handlers.ts` + `client.test.ts` to the canonical 18 folders (`ADR 0002`).
   - Added a dedicated **`Vision Board`** button in the workspace header bar so teams can open the Collab Vision Board in any vault without needing a 19th default folder.
   - Removed fabricated `FileItem` fallback in `VisionBoardCanvas` `onTogglePlayFile` and filtered `createDefaultVisionBoardState` so live vaults never reference mock file IDs.
   - Made `sortVaultFolders` in `vaultTheme.ts` a strict weak ordering.
   - Added `app.<domain>` → `api.<domain>` automatic origin resolution in `client.ts` when `VITE_MOCK=false`.
   - **T078 (`main.tsx`)**: Wrapped MSW worker startup in `try/catch` + `.finally()` so the app always mounts even if the service worker fails to register.
2. **Critical QA Fix — `"Send directly to Shared Vault"` (`handleShareToSharedVault` in `App.tsx`)**:
   - **Bug found**: Clicking `"Send directly to Todo / Shared Vault"` previously called `runMultipartUpload` without a `payload` blob, which uploaded a synthetic 0.5s sine wave (`createSampleWavBlob()`) instead of the artist's real track!
   - **Fix**: Now passes `file.sha256` to `api.uploads.create(sharedVault.id, ...)` to trigger instant 0-byte server-side `dedup: true` cloning of the verified S3 blob (with presigned download blob fallback if not deduped).
3. **Critical QA Fix — Folder Rename & Custom Folder Trash UI (`F09–F10` in `App.tsx`)**:
   - **Bug found**: `api.folders.update` and `api.folders.trash` existed in `client.ts` but had no UI buttons.
   - **Fix**: Added `Rename` and `Trash` buttons in the folder header bar so Swish and Todo can rename any folder in the UI (verifying `folder.kind` keeps its 3D hardware icon!) and delete custom folders.
4. **QA Fix — `BottomTransportPlayer` In-Place Play/Pause (`F13`)**:
   - **Bug found**: Clicking Pause in `BottomTransportPlayer` called `onClose`, unmounting the player and losing seek progress.
   - **Fix**: Added `isPaused` state and `onTogglePause` so Play/Pause toggles in place while `×` closes the player.
5. **QA Fix — $N$-User Avatar Badges, Role Selector & Fault-Tolerant Shared Vault Creation (`F05`, `F17`, `F19`)**:
   - Updated `UserAvatarBadge` (`HardwareIcons.tsx`) to render dynamic initials + deterministic studio colors for 3rd+ users instead of hardcoding `S`/`T`.
   - Restored the `Full Edit + DL (editor)` / `View Only (viewer)` role selector and accurate role badges in `CollaboratorsModal`.
   - Wrapped partner auto-invite in `handleConfirmCreateSharedVault` in `try/catch` so creating a Shared Vault never fails if the partner email hasn't signed up yet on a fresh server.

---

## 3. Cross-Team Improvements Needed (Reported to BRAIN for BLUE & RED)

### 🔵 For BLUE (`shared/**`, `docs/**`, `infra/**`)
1. **Merge PR #45 (`yellow/t026b-vault-gate`) & Redeploy `app.beatstackz.com` in Coolify**:
   - Live `app.beatstackz.com` is still serving `e2ae150` (predating `T026b` `folder.kind` icon keying, `VaultGateScreen`, `VisionBoardCanvas`, and the QA fixes above).
2. **Contract Addition 1 — Server-Backed Trash List & Restore (`shared/src/api/files.ts`)**:
   - Currently, `DELETE /vaults/:vaultId/files/:fileId` sets `deleted_at`, but there is no API route to list trashed items or clear `deleted_at`. Trash state is tracked only in browser `localStorage`, and restoring after the last reference is deleted cannot un-delete the DB row.
   - **Proposal**: Add `GET /vaults/:vaultId/trash` and `POST /vaults/:vaultId/files/:fileId/restore`.
3. **Contract Addition 2 — Cross-Device Vision Board & Custom Folder UI Metadata Sync**:
   - Currently, Vision Board sticky notes, pinned track coordinates, `@timestamp` comments, and custom folder `iconKey`/`colorSlot` are persisted in browser `localStorage` (`bpackz_vault_ui_meta_v2`). When Swish posts a sticky note or `@0:24` mix comment on Mac, Todo on PC does not see it.
   - **Proposal**: Add a lightweight per-vault JSON state endpoint (e.g. `GET/PUT /vaults/:vaultId/board` or metadata column) so Vision Board notes, track pins, and custom folder icons sync across all vault members.
4. **Contract Addition 3 — Pending Vault Invite Links (`/i/:token`) for Unregistered Collaborators**:
   - `POST /vaults/:vaultId/members` returns `404 User not found` if the collaborator hasn't signed up yet.
   - **Proposal**: Add `POST /vaults/:vaultId/invites` + `POST /invites/:token/accept` so owners can copy a shareable invite link (`/i/:token`) for Discord/iMessage that auto-adds the collaborator on signup.

### 🔴 For RED (`backend/**`, `worker/**`)
1. **Implement `GET /vaults/:vaultId/trash` & `POST /vaults/:vaultId/files/:fileId/restore`** (once Blue adds contract):
   - Return soft-deleted files/folders (`deleted_at IS NOT NULL`) within the 30-day recovery window and allow restoring (`deleted_at = NULL`) with an `audit_log` entry.
2. **Implement Per-Vault Vision Board Persistence** (once Blue adds contract):
   - Persist Vision Board sticky notes, pinned file nodes, and timestamped comments in Postgres so Swish and Todo collaborate in real time across devices.
3. **Implement Pending Vault Invite Tokens** (once Blue adds contract):
   - Store pending vault invite tokens and redeem them on signup or `/i/:token` acceptance.
