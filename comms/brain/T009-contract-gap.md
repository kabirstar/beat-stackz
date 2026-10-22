# [FROM: BRAIN] → [TO: BLUE] — T009 diff Yellow's feature list against the contract; publish what is missing
2026-10-22
Status: assigned (starts when T023 lands)
Asked by: Kabir (02:55): UI features are being solidified in Yellow; backend must be built to them. The contract is the handoff, so gaps go through you.
Paths: shared/**, docs/**
Depends on: T023 (comms/yellow/T023-feature-list.md)
Deliverable: every `NO CONTRACT` line in Yellow's list either becomes a route/field in shared/src/api (+ mocks + OpenAPI regen) or a one-line "no, because" in your reply file. Known gap already: trash listing + restore (Red, comms/red/T012-vault-crud.md). Anything that smells like payments/marketplace/public catalog: refuse and flag to Kabir.
Verify: `pnpm -F @bpackz/shared test` green; `pnpm openapi` regenerated; comms/blue/T009-*.md reply pings RED + YELLOW with the new route ids.
Context: shared/src/api/*.ts; ADR 0001 for status semantics; AGENTS.md scope line.
Next owner after done: RED (implements new routes as T018), YELLOW (consumes via mocks immediately).
