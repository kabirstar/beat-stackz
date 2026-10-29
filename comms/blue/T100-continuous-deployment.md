# [FROM: BLUE] → [TO: RED, YELLOW, BRAIN] — T100 continuous deployment (ADR 0005)
Status: done (pipeline, revised v2 same night: no staging, no perf, no PR size cap, duplication check) / open (your parts below)
Commit/PR: blue/cd-pipeline
Contract changes: none
Verification: CI `check` on this PR (coverage gate runs for the first time); `node infra/coverage-gate.mjs` locally after `pnpm -r test:cov`
Blockers: the deploy chain is off until Kabir sets the Coolify secrets and `CD_ENABLED` (HOSTING.md §6)
Next owner: RED (T101), YELLOW (T102, T103), BLUE (T104), BRAIN (T106)

## What changed for everyone
Kabir and Swish decided (2026-10-29): **every green merge to `main` deploys straight to production, then
smoke-tests there, with no human click and no staging.** The tests carry the weight. Read `docs/adr/0005-continuous-deployment.md`; it is one page. The parts that
touch your day:

1. **Coverage gate on every PR.** `pnpm -r test:cov` writes `coverage/lcov.info` per package;
   `infra/coverage-gate.mjs` fails the PR when your package drops below its floor in `infra/coverage-floors.json`
   (backend 95, shared 95, frontend 40 rising 10 a week to 80; never lowered) or when the lines you changed are
   under 80 % covered. Files that truly cannot be unit-tested go in `--test-coverage-exclude` in your `test:cov`
   script, named and justified in the PR. Run it locally: `pnpm -r test:cov && node infra/coverage-gate.mjs` (needs `origin/main` fetched).
   Blue added the one-line `test:cov` script to each package.json (CI support only; same flags as `test` plus
   coverage output). Change it if your `test` script changes.
2. **Merging is deploying.** Do not merge anything you would not want live in ten minutes. Hold work on the task
   board or behind a flag, never on `main`.
3. **Flaky tests** get quarantined the same day with `{ skip: "Txxx flaky" }`; you have a week to fix or delete.
4. **No PR size limit, but no duplication or bloat.** `pnpm dup` (jscpd, 3 % threshold) runs in CI. Review sends
   back: code that re-implements something in `shared` or your package, abstractions with one caller, config for
   constants, dead code, scaffolding for later. Today's report shows 8 clones, 1.9 % overall; two worth folding:
   `frontend/src/api/client.ts` error parsing (lines 100-111 vs 149-160) and `backend/src/upload-routes.ts` the
   transaction prologue (115-121 vs 151-157).
5. **Review latency.** BRAIN dispatches a Blue review run for any PR green and unreviewed for an hour. You are not
   waiting on a human.

## Tasks
- **T101 [RED]** worker coverage: `worker/Dockerfile --target test` runs the tests inside the image, so its lcov never
  reaches the runner. Mount `worker/coverage` into the container (or copy it out) so the gate can read it, then
  add `"worker"` to `infra/coverage-floors.json` in the same PR (Blue co-signs that one line).
  verify: CI prints a `worker` row in the coverage gate.
- **T102 [YELLOW]** Playwright functional flow on mocks: sign-up with invite code → create folder → upload → share
  link → trash → restore, against `pnpm -F web dev:mock`. Runs in `check`. Keep it under 90 seconds.
  verify: `pnpm -F web test:e2e` green in CI.
- **T103 [YELLOW]** the same flow against a real stack, parameterised by `WEB`/`API`/`INVITE_CODE` env, so the
  `deploy-prod` job can run it against production right after each deploy ("validate in prod"). Depends on T102.
- **T104 [BLUE]** purge `smoke-*@example.com` and e2e users older than a day (each deploy creates one).
- **T106 [BRAIN]** weekly post in `#brain-updates`: deploys this week, median merge→production time, failed
  deploys, time to restore. Source: `gh run list --workflow CI --branch main`.

## Kabir's one-time setup (Blue walks him through it)
A Coolify API token, the production app UUID and the invite code as secrets on the GitHub `production`
environment, then `CD_ENABLED=true`. About ten minutes. Details in `docs/HOSTING.md` §6.
