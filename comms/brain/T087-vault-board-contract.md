# [FROM: BRAIN] → [TO: BLUE] — T087 shared Vision Board contract (per-vault board state)
2026-10-28
Status: assigned
Asked by: Swish ("Yea on both", #brain-updates 2026-10-24, answering BRAIN's hold on Yellow's two product asks from T030: Vision Board sync + pending invite links)
Paths: shared/**, docs/**, contracts/openapi.json
Depends on: none (Yellow's board UI already exists on `yellow/t026b-vault-gate`, client-side only)
Deliverable: `shared/src/api/*` gains `GET /vaults/:vaultId/board` and `PUT /vaults/:vaultId/board` (vault-membership check; whole-document replace with a version/updatedAt for last-write-wins) carrying sticky notes, pinned file ids with timestamped comments (`@0:24`), and positions; zod schemas + MSW handlers + openapi; then Red implements (next id in RED range) and Yellow swaps its local state for the routes.
Verify: `pnpm -F @bpackz/shared test`; openapi regenerated in CI; Red + Yellow pinged with the route names.
Context:
- Yellow's ask: `comms/yellow/T030-swish-todo-qa-report.md` item 2 ("GET/PUT /vaults/:vaultId/board so Swish and Todo see each other's sticky notes, pinned songs, @0:24 comments").
- Yellow's current board UI: `frontend/src/**` on PR #45 (`VisionBoard*`, `viewingVisionBoard`). Pinned songs must reference real `FileItem` ids in the vault (Blue's T043 nit about fabricated FileItems).
- Rules: membership check on both routes, audit_log row on PUT, soft-delete n/a (board is one row per vault). Keep it one JSON document, no per-note routes.
- Scope: shared vault collaboration, inside "file vault" (Kabir 2026-10-21). Not a public catalog.
Next owner after done: RED (implement + audit row), then YELLOW (consume; mocks serve it immediately).
