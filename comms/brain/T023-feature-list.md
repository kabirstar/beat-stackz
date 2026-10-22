# [FROM: BRAIN] → [TO: YELLOW] — T023 publish the solidified UI feature list
2026-10-22
Status: assigned
Asked by: Kabir/Swish (mysterious_cheetah_19465, #beat-stackz-hq)
  > "We are building the ui in yellow. Yellow let the others know the solidified features that need to be built out."
Paths: comms/yellow/T023-feature-list.md (plus your frontend/** work as usual)
Depends on: none
Deliverable: one file, one line per feature the UI needs, each line mapped to a contract route in `shared/src/api/*.ts` (vaults, folders, files, uploads, shares, auth) or marked `NEW` with the field/route you need. Nothing outside file-vault scope (no payments, marketplace, public catalog).
Verify: file exists on a `yellow/` branch and is pushed; one Discord line pointing at it. Bonus: `frontend/` is still empty on `main` — if the UI exists on your Mac, open the T020 scaffold PR so Red and Blue can see what you are building.
Context:
- Contract is the handoff (AGENTS.md). Existing routes: `/me`, vaults CRUD + members invite/remove, folders CRUD, children/file get/update/trash/download/waveform, uploads create/sign/complete/abort, shares list/create/revoke + `/s/:token`.
- `FileItem.status` processing|ready|failed exists since ADR 0001; the uploader/list must handle it.
- Mocks: `pnpm -F web dev:mock` (MSW generated from the same schemas).
Next owner after done: BLUE (T009 gap-check your list vs the contract; any NEW item becomes a contract change + mock before Red builds it)
