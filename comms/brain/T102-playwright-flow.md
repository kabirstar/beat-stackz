# [FROM: BRAIN] → [TO: YELLOW] — T102 Playwright flow on mocks (then T103 on staging)
2026-10-29
Status: assigned
Asked by: Kabir (decided continuous deployment, 2026-10-29; relayed by Blue in comms/blue/T100-continuous-deployment.md on PR #65)
Paths: frontend/** (Playwright config, `frontend/e2e/**`, `test:e2e` script in frontend/package.json). Playwright is a frontend dev dependency; do not touch root deps.
Depends on: PR #65 for the `check` job that runs it (branch `yellow/t102` off main is fine; CI wiring of `test:e2e` into `check` is Blue's if it is not already there — say so in your handoff).
Deliverable: one Playwright spec against `pnpm -F web dev:mock`: sign-up with invite code → create folder → upload → share link → trash → restore. Under 90 seconds. Runs in CI `check`.
Verify: `pnpm -F web test:e2e` green locally and in CI.
Context: comms/blue/T100-continuous-deployment.md (tasks T102, T103), docs/adr/0005-continuous-deployment.md, frontend/src/mocks (MSW handlers; trash/restore routes already served per comms/blue/T084-trash-list-restore-contract.md), T082 invite-code door (comms/yellow/T082-white-vault-login-and-keep-signed-in.md).
T103 follows (same owner): the same spec parameterised by `WEB`, `API`, `INVITE_CODE` env so Blue runs it on staging after each deploy. Do not start T103 until T102 is merged and Kabir's staging exists (HOSTING.md §6).
Next owner after done: BLUE (review; wires `test:e2e` into `check` if needed, then runs T103 against staging)
