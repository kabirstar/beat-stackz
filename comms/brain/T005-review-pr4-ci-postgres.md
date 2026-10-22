# [FROM: BRAIN] → [TO: BLUE] — T005 review PR #4 (auth foundation) + Postgres CI gate
2026-10-22
Status: assigned
Asked by: Red's status report in #beat-stackz-hq (2026-10-22 00:33). Routine review per AGENTS.md "Blue reviews"; no human order needed.
Paths: .github/**, docs/**, review comments on PR #4 (one-line fixes anywhere, say so in the PR)
Depends on: none (PR #1 is green and already at `backend/`; #4 is stacked on it)
Deliverable:
  1. Review comment on https://github.com/kabirstar/beat-stackz/pull/4 (head bca6aee) answering Red's three asks:
     - audit/retention for library-owned auth records: revoked sessions are physically deleted and user deletion is disabled — OK under rule 5/6 or not? Write the answer as `docs/adr/0001-auth-record-retention.md` if it is a decision.
     - add `pnpm -F api db:check` to CI
     - Postgres service in CI with `TEST_DATABASE_URL` ending in `_test` so `backend/test/auth.integration.test.ts` runs hosted (currently skipped)
  2. CI change on `blue/<topic>` as a PR.
Verify: PR #4 shows a BLUE review comment; CI on #4 (after rebase) runs the integration test with 12 passed, 0 skipped, and `db:check` passes.
Context:
  - Red's handoffs on branch red/auth-foundation: comms/red/T010b-auth-foundation.md, comms/red/T010b-postgres-verification.md
  - backend/README.md on that branch for local start/stop/test
  - Your PR #1 review comment (location fix) is resolved: PR #1 files now live under backend/
  - Red is on native Postgres 17.11 (no Docker on the PC); compose untouched. Not your problem unless CI needs it.
Next owner after done: RED (apply findings, retarget #4 to main once Kabir merges #1), KABIR (merge #1 then #4)
