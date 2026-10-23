# ADR 0002 — Default folder taxonomy and product vision

Date: 2026-10-23. Decided by Kabir. Recorded by Blue.

## Vision (Kabir)

Beat Stackz is for **artists and producers**, to ease **creating, sharing and
marketing music**. v1 scope stays the file vault (AGENTS.md); "marketing" shapes
the taxonomy (media, covers, bts) and later features (press kits, share pages),
not payments or a storefront.

## Decision

Yellow's icon taxonomy, already live in the UI, becomes the default for every
vault. Each new vault, personal or shared, is seeded with this tree, in this order:

| kind | name | children (kind → name) |
|---|---|---|
| `beats` | beats | — |
| `presets` | presets | `presets/plugin` → plugin, `presets/vocals` → vocals |
| `vocals` | vocals | `vocals/main` → main, `vocals/adlib` → adlib, `vocals/bg` → bg |
| `songs` | songs | `songs/demo` → demo, `songs/mix` → mix, `songs/drop` → drop |
| `media` | media | `media/photos` → photos, `media/videos` → videos, `media/mv` → music video, `media/bts` → bts, `media/covers` → album covers |

Source of truth: `DEFAULT_FOLDERS` and `FolderKind` in `shared/src/common.ts`.

`folders.kind` (nullable enum, slug path) records which default a folder is. It
survives renames so the UI keeps the matching icon. User-created folders have
`kind = null`. Default folders are otherwise ordinary: renamable, trashable,
movable. Nothing recreates a trashed default. Kind is never accepted from the
client; only the seeder sets it.

## Consequences

- **Red (T026a)**: migration adds `folders.kind text null` + CHECK on the enum;
  `personal-vault.ts` and `POST /vaults` insert the tree (18 rows) in the same
  transaction as the vault; `folders.create` leaves `kind` null. Backfill existing
  vaults: insert each default only where no folder with that name exists at that
  level; skip, never rename.
- **Yellow (T026b)**: `vaultTheme.ts` keys icons by folder *name* today; key by
  `kind` with name as fallback for `kind = null`. Sort defaults in
  `DEFAULT_FOLDERS` order, then user folders by name. The frontend mock seeder
  already writes `kind` (Blue added it in T026).
- **Blue**: contract, shared mocks, OpenAPI, this ADR in one PR. `Folder.kind`
  carries `.default(null)` only until T026a lands, so the current backend keeps
  parsing; remove the default then.

## Rejected

- Matching icons by name: breaks on the first rename ("beats" → "type beats").
- Flat slugs: "vocals" is both a root and a preset sub-folder, so kind is a path.
- A `folder_kinds` table: eighteen fixed values do not need a table.
- A second, Blue-invented taxonomy (stems / masters / contracts): Yellow's set
  is what the founders approved and what the icons exist for.
