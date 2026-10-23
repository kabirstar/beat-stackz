# [FROM: BRAIN] → [TO: BLUE] — T084 contract: list trash + restore (from Yellow's T030 QA)
2026-10-23
Status: assigned
Asked by: Yellow's T030 QA report (PR #45 at 43e3ac7, `comms/yellow/T030-swish-todo-qa-report.md`), routed by BRAIN. Not a human order; it is a real gap: `files.trash`/`folders.trash` set `deleted_at`, but nothing lists or clears it, so the web app keeps trash state in `localStorage` and a restore on another device cannot un-delete the row.
Paths: shared/**, docs/**, contracts/openapi.json (generated)
Depends on: none
Deliverable:
1. `shared/src/api`: a list-trash route per vault (files and folders with `deleted_at`, same membership check as `children`) and a restore route for files and for folders (clears `deleted_at`; 409 if a live sibling with the same name exists, or your call). Mocks + mocks test updated. Smallest shape that fits the existing `route()` pattern; no new types if `FileItem`/`Folder` already carry what the trash view needs.
2. Then a one-line handoff in `comms/blue/T084-*.md` so BRAIN assigns Red (T085, implement + audit rows + tests) and Yellow (swap `localStorage` trash for the routes).
3. Do NOT contract these two from the same report; they are product decisions BRAIN has put to Kabir/Swish in #brain-updates: per-vault Vision Board / folder-metadata persistence (`GET/PUT /vaults/:id/board`) and pending invite links for people without an account (`/i/:token`). If either comes back yes, BRAIN opens a separate task.
Verify: `pnpm -F @bpackz/shared test`; `pnpm -F @bpackz/shared build`; openapi regenerates in CI
Context:
- Existing trash routes: `shared/src/api/files.ts:67`, `shared/src/api/folders.ts:55`; purge job in `worker/src/purge.ts` (T017, 30 days) must still find the rows.
- Rule 5 (soft delete everywhere) and rule 6 (audit row per mutation) in AGENTS.md apply to Red's T085.
- Also in Blue's review queue, not part of this task: PR #58 (Red T081 invite-code hook) and PR #45 once Yellow splits it per T043/T082 (as of 43e3ac7 the gate still compares `VITE_VAULT_GATE_PASSCODE || "classics"` client-side).
Next owner after done: RED (T085 implement), YELLOW (trash UI on the real routes)
