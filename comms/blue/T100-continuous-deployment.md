# [FROM: BLUE] → [TO: RED, YELLOW, BRAIN] — T100 continuous deployment (ADR 0005)
Status: done (pipeline) / open (your parts below)
Commit/PR: blue/cd-pipeline
Contract changes: none
Verification: CI `check` on this PR (coverage gate runs for the first time); `node infra/coverage-gate.mjs` locally after `pnpm -r test:cov`
Blockers: the deploy chain is off until Kabir sets the Coolify secrets and `CD_ENABLED` (HOSTING.md §6)
Next owner: RED (T101), YELLOW (T102, T103), BLUE (T104, T105), BRAIN (T106)

## What changed for everyone
Kabir decided (2026-10-29): **every green merge to `main` deploys to staging, smoke-tests, then deploys to
production, with no human click.** Read `docs/adr/0005-continuous-deployment.md`; it is one page. The parts that
touch your day:

1. **Coverage gate on every PR.** `pnpm -r test:cov` writes `coverage/lcov.info` per package;
   `infra/coverage-gate.mjs` fails the PR when the lines you changed are under 80 % covered, or when your package
   drops below its floor in `infra/coverage-floors.json`. Floors start at the first measured value (this PR) and
   only go up. Run it locally: `pnpm -r test:cov && node infra/coverage-gate.mjs` (needs `origin/main` fetched).
   Blue added the one-line `test:cov` script to each package.json (CI support only; same flags as `test` plus
   coverage output). Change it if your `test` script changes.
2. **Merging is deploying.** Do not merge anything you would not want live in ten minutes. Hold work on the task
   board or behind a flag, never on `main`.
3. **Flaky tests** get quarantined the same day with `{ skip: "Txxx flaky" }`; you have a week to fix or delete.
4. **PRs over 400 changed lines** get split before review unless the handoff says why not.
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
- **T103 [YELLOW]** the same flow against a real stack, parameterised by `WEB`/`API`/`INVITE_CODE` env, so Blue can
  run it on staging after each deploy. Depends on T102.
- **T104 [BLUE]** purge `smoke-*@example.com` users older than a day (the smoke run creates one per deploy).
- **T105 [BLUE]** k6 budgets against staging on `main`: `/health` p95 200 ms, `children` 500 ms, `uploads.create`
  800 ms. Fails promotion, never a PR.
- **T106 [BRAIN]** weekly post in `#brain-updates`: deploys this week, median merge→production time, failed
  deploys, time to restore. Source: `gh run list --workflow CI --branch main`.

## Kabir's one-time setup (Blue walks him through it)
Coolify staging resource + DNS + R2 bucket, a Coolify API token, GitHub environments `staging` and `production`
with their secrets/variables, then `CD_ENABLED=true`. Details in `docs/HOSTING.md` §6.
