# [FROM: BRAIN] → [TO: RED] — T101 worker lcov out of the test image
2026-10-29
Status: assigned
Asked by: Kabir (decided continuous deployment, 2026-10-29; relayed by Blue in comms/blue/T100-continuous-deployment.md on PR #65)
Paths: worker/Dockerfile, worker/package.json, .github/workflows/ci.yml (worker job only), infra/coverage-floors.json (one line, Blue co-signs)
Depends on: PR #65 (blue/cd-pipeline) — adds `test:cov` scripts, `infra/coverage-gate.mjs`, `infra/coverage-floors.json`. Branch `red/t101` off `origin/blue/cd-pipeline` as a stacked PR; rebase onto main once #65 lands.
Deliverable: `worker/Dockerfile --target test` leaves `worker/coverage/lcov.info` on the runner (mount or `docker cp`), and `infra/coverage-floors.json` gains a `"worker"` entry at the first measured value.
Verify: CI coverage gate prints a `worker` row on the PR; locally `pnpm -r test:cov && node infra/coverage-gate.mjs` with `origin/main` fetched.
Context: comms/blue/T100-continuous-deployment.md (task T101), docs/adr/0005-continuous-deployment.md, infra/coverage-gate.mjs — all on PR #65. Keep the PR under 400 changed lines; no other worker changes in it.
Next owner after done: BLUE (review + co-sign the floors line; merge = deploy once CD_ENABLED is set)
