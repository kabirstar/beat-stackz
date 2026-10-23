# [FROM: BLUE] → [TO: RED, YELLOW, BRAIN] — T026 default folder taxonomy (ADR 0002)
2026-10-23
Status: done (contract + mocks + ADR); Red and Yellow work below
Commit/PR: blue/t026-taxonomy → https://github.com/kabirstar/beat-stackz/pull/29
Contract changes: `Folder.kind: FolderKind | null` added (slug path, e.g. `songs/mix`; `.default(null)` until T026a). `FolderKind`, `DEFAULT_FOLDERS` exported from `@bpackz/shared`. OpenAPI regenerated.
Verification: `pnpm -F @bpackz/shared test` 7/7; `pnpm -F web test` and typecheck green; openapi diff clean
Next owner: RED (T026a), YELLOW (T026b)

## Decision (Kabir, 2026-10-23)
1. **Yellow's icon taxonomy is the default for every vault.** Not a new list: the exact tree already in `frontend/src/mocks/handlers.ts` (`DEFAULT_VAULT_TAXONOMY`) is now `DEFAULT_FOLDERS` in `shared/src/common.ts`. beats · presets{plugin, vocals} · vocals{main, adlib, bg} · songs{demo, mix, drop} · media{photos, videos, music video, bts, album covers}. 18 folders.
2. **Vision:** for artists and producers, to ease creating, sharing and marketing music. Now in AGENTS.md.
Full text: `docs/adr/0002-default-folder-taxonomy.md`.

## T026a — RED
- Migration: `folders.kind text null` + CHECK against `FolderKind` values. No default.
- `personal-vault.ts` and `POST /vaults`: insert the 18 rows (parents before children, `DEFAULT_FOLDERS` order) in the same transaction as the vault, `createdBy` = creating user, one audit row per vault.
- `POST /vaults/:id/folders`: `kind` stays null. `kind` is not in the request schema; never accept it.
- Every `Folder` response includes `kind` (create, get, update, children).
- Backfill existing vaults in the migration: insert each default only where no folder with that name exists at that level. Skip, never rename.
- verify: integration test asserts 5 root + 13 child folders with the right kinds after signup and after vault create; `Folder.parse` on responses.
- Tell Blue when merged so the `.default(null)` comes off the contract.

## T026b — YELLOW
- `vaultTheme.ts` keys icons by folder **name** today. Key by `folder.kind` first; fall back to name only when `kind` is null. Then renaming "beats" keeps its icon.
- Sort: defaults in `DEFAULT_FOLDERS` order (root and children), then user folders by name.
- Blue already added `kind` to your mock seeder (`ensureVaultHasTaxonomy`) and to three fixtures in `App.test.tsx` so this PR stays green. Said so in the PR; no behaviour changed.
- Shared mocks now seed the same tree in both vaults with ids `fo_p_<kind>` / `fo_s_<kind>` (slash → underscore), e.g. `fo_p_songs_mix`. Old `fo_stems`/`fo_masters`/`fo_art` ids are gone.

## Why `kind` and not names
Icons matched by name break on the first rename. One nullable column, 18 values, no lookup table. Kind is a path because "vocals" is both a root and a sub-folder of presets.
