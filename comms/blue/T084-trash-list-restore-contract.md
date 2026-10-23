# [FROM: BLUE] → [TO: BRAIN, RED, YELLOW] — T084 contract: list trash + restore
2026-10-23
Status: done
Commit/PR: blue/t084 → PR (see COMMS_LOG)
Contract changes: three routes added, nothing removed or renamed
- `GET /vaults/:vaultId/trash` (`routes.files.listTrash`) — `Page` query; `{ folders: (Folder & {deletedAt})[], files: (FileItem & {deletedAt})[], nextCursor }`. Trash **roots only**: rows whose parent is live or null. Newest `deletedAt` first. Member check same as `children`.
- `POST /vaults/:vaultId/files/:fileId/restore` (`routes.files.restore`) → `FileItem`. 404 if not in trash; 409 if the parent folder is still trashed or a live sibling has the same name.
- `POST /vaults/:vaultId/folders/:folderId/restore` (`routes.folders.restore`) → `Folder`. Same 404/409; also clears `deleted_at` on the descendants trashed **with it** (same `deleted_at` value). Anything trashed earlier stays in trash and shows up as its own root once the parent is live.
Verification: `pnpm -F @bpackz/shared test` → 7 passed (mock flow now covers trash → list → 409s → restore); `typecheck` clean; `contracts/openapi.json` regenerated (21 paths).
Blockers: none
Next owner: RED (T085), YELLOW (trash UI)

## RED — T085 implement (backend/**)
- `files.listTrash`: `deleted_at IS NOT NULL` plus the root filter (file: `folder_id IS NULL OR parent folder.deleted_at IS NULL`; folder: same on `parent_id`). Order `deleted_at DESC, id`, cursor like `children`.
- Restore in one transaction: re-check membership (editor), parent live, UNIQUE collision → 409 `conflict`; `UPDATE ... SET deleted_at = NULL WHERE deleted_at = $trashedAt` over the folder subtree (CTE, same as trash) so earlier-trashed descendants stay put. Audit rows `file.restore` / `folder.restore` (rule 6). Purge job (`worker/src/purge.ts`) needs no change; restored rows simply lose `deleted_at`.
- Tests: trash → list shows root only → restore brings subtree back → 404 on second restore → 409 on collision / trashed parent.

## YELLOW — trash UI on the real routes (frontend/**)
- Replace the `localStorage` trash with `files.listTrash` + the two restore routes. Show `deletedAt` ("purges in N days", 30 from `deletedAt`). Until Red lands, `pnpm -F web dev:mock` already serves all three.

## Not contracted here (BRAIN has them with Kabir/Swish)
Vision Board / folder-metadata persistence and pending invite links. Separate tasks if approved.
