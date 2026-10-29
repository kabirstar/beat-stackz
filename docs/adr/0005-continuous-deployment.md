# ADR 0005 — Continuous deployment: every green merge to `main` ships to production

Date: 2026-10-29 · Status: accepted · Decided by: Kabir (automatic promotion to production; the rest delegated to Blue's judgement with one constraint: agents keep building on their own and are not bottlenecked)

## Context
Production ran a build five days behind `main` because deploys were a manual click in Coolify and nothing checked
drift. Kabir wants the pipeline his day job runs (unit coverage floor, functional tests, live-dependency tests mocked
and real, performance tests, a QA environment before production) scaled to a three-agent team and a ten-minute budget.

## Decisions
1. **Two stages, no humans in the loop.** PR → `check` (the gate). Push to `main` → `deploy-staging` → smoke on staging
   → `deploy-prod` → smoke on production. A failure at any stage stops the chain and posts to `#brain-updates`.
   Supersedes ADR 0004 item 1 for production deploys: no co-sign; Kabir or Swish can still veto by reverting.
2. **Coverage, measured with Node's built-in runner.** Each package has `test:cov` (lcov to `coverage/lcov.info`).
   `infra/coverage-gate.mjs` fails a PR when **changed lines are under 80 % covered** or a package falls **below its
   floor** in `infra/coverage-floors.json`. Floors start at the first measured value and ratchet: Blue raises a floor
   when the package has sat 5 points above it for a month. Diff coverage, not a flat 80 % per repo, because the
   frontend has two test files today and a flat floor would block Yellow for weeks.
3. **Mocked and real, both.** `shared` tests run every route against the MSW mocks generated from the contracts
   (mocked). Backend and worker tests run against real Postgres and RustFS in CI (live dependency). Both are already
   in `check`; neither may be skipped to make a PR green.
4. **Functional tests = Playwright.** Yellow writes the sign-up → upload → share → trash flow once against the mocks
   (runs in `check`) and once against the compose stack (runs on `main` against staging). Until it exists,
   `infra/smoke.mjs` is the functional gate.
5. **Performance = budgets, not history.** k6 against staging on `main` only, p95 budgets: `/health` 200 ms,
   `children` 500 ms, `uploads.create` 800 ms. Fails the promotion, never a PR.
6. **Staging on the same Hetzner box.** A second Coolify resource on the same repo and compose file, its own
   Postgres and R2 bucket (`bpackz-staging`), `staging.beatstackz.com` / `api-staging.beatstackz.com`. A second
   box when outside users arrive.
7. **Budgets.** `check` is capped at 10 minutes (workflow `timeout-minutes`). No cap on the `main` chain.
8. **Flaky tests.** A test that fails twice without a code cause is quarantined (`skip` with the task id) the same
   day; its owner has a week to fix or delete it. A quarantined test does not block anyone.
9. **No bottleneck on review.** Blue's review stays the only non-CI gate. BRAIN dispatches an unattended Blue review
   run for any open PR that has been green and unreviewed for an hour, so review latency is minutes, not a workday.
   PRs over 400 changed lines are split before review unless the handoff says why not.
10. **Ownership.** Blue owns the pipeline and the floors file. Each colour owns its tests and its coverage number.
    BRAIN posts deployment frequency, lead time, change-failure rate and time to restore weekly.

## Consequences
- Merging is deploying. Nothing on `main` is "not ready"; use the task board to hold work, not `main`.
- Rollback is `node infra/deploy.mjs prod --commit <sha>` (previous green commit), under two minutes.
- The chain is off until Kabir sets the Coolify token, app UUIDs and invite codes as GitHub environment secrets and
  flips the `CD_ENABLED` repository variable; `check` is unaffected meanwhile. See `docs/HOSTING.md` §6.
- Smoke runs create one `smoke-*@example.com` user per deploy; a purge of smoke users is a follow-up (T104).
