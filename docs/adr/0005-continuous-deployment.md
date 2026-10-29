# ADR 0005 — Continuous deployment: every green merge to `main` ships to production

Date: 2026-10-29 · Status: accepted · Decided by: Kabir and Swish (automatic promotion to production, no staging, whole-repo 80 % coverage target, no PR size limit but no duplication or bloat; the rest delegated to Blue with one constraint: agents keep building on their own and are not bottlenecked). Revised the same night after Swish's input; v1 had a staging stage and a 400-line PR cap.

## Context
Production ran a build five days behind `main` because deploys were a manual click in Coolify and nothing checked
drift. Kabir wants the pipeline his day job runs (unit coverage floor, functional tests, live-dependency tests mocked
and real, performance tests, a QA environment before production) scaled to a three-agent team and a ten-minute budget.

## Decisions
1. **One gate, then production.** PR → `check` (the gate). Push to `main` → `deploy-prod` → smoke on production →
   post to `#brain-updates`. No staging environment: the tests carry the weight and we validate in production,
   which is fine while there are no outside users (Swish). Supersedes ADR 0004 item 1 for production deploys: no
   co-sign; Kabir or Swish can still veto by reverting.
2. **Coverage: 80 % of the whole package after merge, measured with Node's built-in runner.** Each package has
   `test:cov` (lcov to `coverage/lcov.info`). `infra/coverage-gate.mjs` fails a PR when a package falls **below its
   floor** in `infra/coverage-floors.json` or when **changed lines are under 80 % covered** (so every PR moves the
   number the right way). Floors: backend 95, shared 95, frontend 40 today; the frontend floor rises 10 points per
   week until it reaches 80, then every package holds 80 for good. Files that cannot be unit-tested (bootstrap,
   generated code, type-only modules) are excluded through `--test-coverage-exclude` in that package's `test:cov`
   script, each exclusion named in the PR; Blue rejects exclusions that hide logic.
3. **Mocked and real, both.** `shared` tests run every route against the MSW mocks generated from the contracts
   (mocked). Backend and worker tests run against real Postgres and RustFS in CI (live dependency). Both are already
   in `check`; neither may be skipped to make a PR green.
4. **Functional tests = Playwright, two layers like the BFF/UI split Swish described.** Backend keeps its
   live-dependency suite (real Postgres + RustFS). Yellow adds UI tests that assert elements and flows: once against
   the mocks (runs in `check`), and the same flow against production right after each deploy, as the "validate in
   prod" step. Until it exists, `infra/smoke.mjs` is the post-deploy check.
5. **No performance tests for now** (Swish). Revisit when there are users.
6. **No duplication, no bloat, instead of a PR size limit.** `pnpm dup` (jscpd, threshold 3 % duplicated lines,
   50-token clones) runs in `check` and fails the PR. Review checks the rest: reuse what exists in `shared` or the
   package before writing new code, no abstraction with one caller, no config for a constant, no dead code left
   behind, no "for later" scaffolding. Blue sends a PR back for any of these without needing a line count.
7. **Budgets.** `check` is capped at 10 minutes (workflow `timeout-minutes`). No cap on the `main` chain.
8. **Flaky tests.** A test that fails twice without a code cause is quarantined (`skip` with the task id) the same
   day; its owner has a week to fix or delete it. A quarantined test does not block anyone.
9. **No bottleneck on review.** Blue's review stays the only non-CI gate. BRAIN dispatches an unattended Blue review
   run for any open PR that has been green and unreviewed for an hour, so review latency is minutes, not a workday.
   There is no PR size limit; a PR is as big as its task.
10. **Ownership.** Blue owns the pipeline and the floors file. Each colour owns its tests and its coverage number.
    BRAIN posts deployment frequency, lead time, change-failure rate and time to restore weekly.

## Consequences
- Merging is deploying. Nothing on `main` is "not ready"; use the task board to hold work, not `main`.
- Rollback is `node infra/deploy.mjs prod --commit <sha>` (previous green commit), under two minutes.
- The chain is off until Kabir sets the Coolify token, the production app UUID and the invite code as secrets on the
  GitHub `production` environment and flips the `CD_ENABLED` repository variable; `check` is unaffected meanwhile.
  See `docs/HOSTING.md` §6.
- Smoke runs create one `smoke-*@example.com` user per deploy; a purge of smoke users is a follow-up (T104).
