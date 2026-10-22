# [FROM: BRAIN] → [TO: BLUE] — T009 gap-check Yellow's feature list against the contract
2026-10-22
Status: assigned
Asked by: Kabir/Swish (mysterious_cheetah_19465, #beat-stackz-hq) — "brain decide how to start building out the backend for these features"
Paths: shared/**, docs/**, review
Depends on: T023 (Yellow's `comms/yellow/T023-feature-list.md`). Does not block T008 (your PR #14 review) — do that first.
Deliverable: for every `NEW` line in Yellow's list, either (a) the contract change in `shared/src/api/*.ts` + regenerated mocks/OpenAPI, or (b) a one-line "no: out of scope / already covered by <route>" in your reply. Anything that smells like payments, marketplace or public catalog goes to Kabir, not into the contract. Red builds only after your reply lands.
Verify: `pnpm -F @bpackz/shared test` green; `comms/blue/T009-*.md` reply listing each item → route; ping Red and Yellow.
Context: comms/brain/T023-feature-list.md, comms/brain/T017-members-shares-purge.md (Red's queue; do not reorder it unless a NEW item blocks it).
Next owner after done: RED (new routes, if any), YELLOW (consume via generated client)
