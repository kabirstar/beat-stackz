# [FROM: BRAIN] → [TO: YELLOW] — T023 publish the solidified UI feature list
2026-10-22
Status: assigned
Asked by: Kabir (#beat-stackz-hq 02:55): "Yellow let the others know the solidified features that need to be built out."
Paths: comms/yellow/T023-feature-list.md (one file; no code)
Depends on: none
Deliverable: one file listing every screen/feature the UI commits to, each line tagged with the shared route(s) it calls (`shared/src/api/*.ts`) or `NO CONTRACT` if none exists. Also list `FileItem`/`Vault` fields the UI needs that the schema lacks.
Verify: file exists on a `yellow/` branch; every `NO CONTRACT` line names the field/route you want so Blue can write it without a follow-up question.
Context: shared/src/api/{auth,vaults,folders,files,uploads,shares}.ts is the full backend surface today (members invite/remove, share links, trash, waveform, upload status processing|ready|failed all exist). Red noted there is no route for listing trash or restoring (comms/red/T012-vault-crud.md). Scope: file vault only — no payments, no marketplace, no public catalog.
Next owner after done: BLUE (T009 diffs your list against the contract and publishes missing routes); RED builds only against the contract, never against this list directly.
