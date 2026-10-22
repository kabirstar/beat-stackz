# [FROM: YELLOW] → [TO: BLUE, BRAIN, RED] — T023 Solidified UI Feature List & Shared Route Mapping

Status: done
Commit/PR: `yellow/t020-t021-vault-ui` → PR #21 (`https://github.com/kabirstar/beat-stackz/pull/21`)
Contract changes: none required (all UI features map cleanly to existing `@bpackz/shared` routes; UI-only visual metadata persists in `localStorage`)
Verification: `pnpm -F @bpackz/shared build && pnpm typecheck && pnpm lint && pnpm test && pnpm -F web build`
Next owner: BLUE (merge PR #21 on green; T009 gap-check confirms zero blocking contract additions needed)

## Feature → `@bpackz/shared` Route Mapping

| # | UI Feature | Status | Shared Contract Route (`@bpackz/shared`) | Notes |
|---|---|---|---|---|
| 1 | Sign in / Sign up / Sign out & current session | Shipped (`T020`/`T021`) | `routes.auth.me` (`GET /me`), Better Auth `/api/auth/sign-in/email`, `/api/auth/sign-up/email`, `/api/auth/sign-out` | Works against MSW mocks (`dev:mock`) and live Better Auth (`dev:live`). |
| 2 | Personal Vaults (`Swish` Black & Red, `Todo` White & Black) & Shared Vaults | Shipped (`T021`) | `routes.vaults.list` (`GET /vaults`), `routes.vaults.create` (`POST /vaults`), `routes.vaults.get` (`GET /vaults/:vaultId`) | Per-Shared-Vault random 5-slot hardware color palette saved client-side (`bpackz_vault_ui_meta_v2`). |
| 3 | Top Shared Vaults Dropdown (switch, inspect collaborators, inline `+ Create`) | Shipped (`T021`) | `routes.vaults.list`, `routes.vaults.create`, `routes.vaults.members` (`GET /vaults/:vaultId/members`), `routes.vaults.invite` (`POST /vaults/:vaultId/members`) | Collaborator names on file cards resolve from `vaults.members` (`VaultMember`). |
| 4 | 3D Studio Hardware Folder Grid (Personal Vaults & Subfolders) + Shared Vault Main-Page 3D Rap Object Models (`rap_cup`, `rap_chain`, `rap_money`, `rap_lambo`, `rap_watch`) + Minimalistic 3D Aston Spirit Mic (`vocals`) | Shipped (`T021`) | `routes.files.listChildren` (`GET /vaults/:vaultId/children`), `routes.folders.create` (`POST /vaults/:vaultId/folders`), `routes.folders.patch`, `routes.folders.remove` | Pure CSS/SVG 3D multi-plane objects; custom icon/color slot stored in client UI metadata (`NEW` optional server persistence later if desired, non-blocking). |
| 5 | Separated Studio Mono File Cards with ADR 0001 `FileItem.status` (`processing` \| `ready` \| `failed`) | Shipped (`T021`/`T022`) | `routes.files.listChildren`, `routes.files.get` (`GET /vaults/:vaultId/files/:fileId`) | `processing` shows `"Verifying"` badge + spinner and disables play/download; `App.tsx` polls `files.get` until `ready` or `failed`; `failed` shows `"Upload failed, try again"` + retry trigger. |
| 6 | Presigned Multipart Uploader (real WebCrypto SHA-256 + 64 MiB part slicing + scoped dedup) | Shipped (`T022`) | `routes.uploads.create` (`POST /vaults/:vaultId/uploads`), `routes.uploads.sign` (`POST .../parts`), `routes.uploads.complete` (`POST .../complete`), `routes.uploads.abort` (`POST .../abort`) | Computes real SHA-256 via `crypto.subtle.digest("SHA-256", ...)` so Red's `T015` verification worker matches the uploaded bytes. |
| 7 | Bottom Transport Audio Player & Presigned Download | Shipped (`T022`) | `routes.files.downloadUrl` (`GET /vaults/:vaultId/files/:fileId/download`), `routes.files.waveform` (`GET /vaults/:vaultId/files/:fileId/waveform`) | Real HTML5 `<audio>` element streams from presigned inline URL when `file.status === "ready"`. |
| 8 | Share Sheet (1-tap Share to Shared Vault + Public Share Links `/s/:token`) & 30-Day Trash | Shipped (`T022`) | `routes.shares.create` (`POST /vaults/:vaultId/files/:fileId/shares`), `routes.shares.list`, `routes.shares.revoke`, `routes.files.trash` (`DELETE /vaults/:vaultId/files/:fileId`) | Ready for Red's `T017` live endpoints. |
