# ADR 0004 — Decisions from the brain-handoff reviews that bind this repo

Date: 2026-10-27 · Status: accepted · Decided by: Kabir, on Blue's T001-T005 reviews in `kabirstar/brain-handoff` (`comms/blue/`)

## Context
BRAIN // OS (the multi-agent orchestrator in `kabirstar/brain-os`) is being designed around BPACKZ. Several of its
locked decisions change how this repo is reviewed, gated and shared. They are recorded here so `AGENTS.md` and the
brain-handoff documents say the same thing.

## Decisions
1. **Commander tiebreak.** Kabir and Swish keep equal authority to direct work. On a direct, simultaneous conflict the
   work is held and both are pinged; if it must be resolved without both present, Kabir's directive wins. Co-sign from
   both is required only for `shared/**`, `docs/adr/**`, `infra/**` and production deploys; a 30-minute timeout then
   proceeds on any other path. `AGENTS.md` team table updated.
2. **Cross-model review.** Blue (Claude) does not grade its own PRs. Red (Codex) reviews Blue's PRs; Blue reviews
   Red's and Yellow's. Blue still merges once CI is green (ADR-free rule from 2026-10-21 stands).
3. **Separate bucket.** BRAIN-OS media, scrapes and backups live in a `brain-artifacts` bucket with its own access
   key. The BPACKZ `bpackz-vault` bucket holds users' files only. Same RustFS/R2, never shared keys or policy.
4. **Standing quality rule.** A tool is never cut only because it is cheaper if the cut lowers visual, audio or
   scraping quality. In this repo that means `audiowaveform` stays for the player waveform, but visualizer features
   come from real extractors (librosa / Essentia) in the brain-os workers, not from peaks.
5. **Where brain-os contracts live.** Events, deliverables, jobs and station-layout schemas are in
   `brain-os/server/contracts.ts` (Blue). They are not added to `@bpackz/shared`, which is the BPACKZ API contract
   and keeps the scope lock (file vault only).
6. **Split gate.** Local pre-check `pnpm gate:fast` = `typecheck + lint + gitleaks protect --staged`, under 5 s,
   needs `gitleaks` installed (`winget install gitleaks` / `brew install gitleaks`). CI is the gate: gitleaks over
   history, typecheck, lint, tests, drizzle check, OpenAPI drift. A green local gate is never a reason to skip CI.
7. **PR ledger.** `docs/PR_LEDGER.md` is generated from `git log` on every merge to `main` by
   `.github/workflows/pr-ledger.yml` (idempotent: regenerates the whole file, so a missed run self-heals). Hand edits
   are overwritten. The `pr-agent` walkthrough column is a follow-up; until then the row carries the squash subject.

## Rejected
Humanizer or any prose pass over `shared/**`, `docs/adr/**`, commit messages or API error strings (correctness
hazard); a 24/7 Chronos brain (replaced by this ledger action plus an on-demand skill in brain-os); putting brain-os
tables in `@bpackz/shared` (scope drift).
