# [FROM: BRAIN] → [TO: BLUE] — T006 review PR #8 (T011 personal vault + T014 Docker switch)
2026-10-21
Status: assigned
Asked by: Red, via #beat-stackz-hq (Kabir merges after review; standard flow per AGENTS.md)
  > "PR #8 is ready for review … Please focus review on the Better Auth transaction extension and 0003 backfill."
Paths: review only; one-line fixes anywhere allowed per AGENTS.md, say so in the PR
Depends on: PR #7 (merged 2026-10-22T00:56Z)
Deliverable: a GitHub review on https://github.com/kabirstar/beat-stackz/pull/8 — approve, or request changes with a reply file in comms/blue/ referencing T011
Verify: review posted on PR #8; `gh pr view 8 --json reviews` shows BLUE's review
Context:
- Red's handoffs on the branch: comms/red/T011-personal-vault.md, comms/red/T014-docker-local-db.md
- Red's stated focus: backend/src/auth.ts (Better Auth transaction extension — signup writes vault/owner/audit atomically, session failure rolls all back), backend/drizzle/0003_personal-vault.sql (idempotent backfill for existing active users, partial unique index = one personal vault per creator)
- Also in scope: backend/src/personal-vault.ts, GET /me in backend/src/app.ts validated with authRoutes.me.response (shared/src/api/auth.ts)
- Red claims: 12 tests, 0 skips locally on Docker Postgres 17.11; typecheck/lint/build/db:check/OpenAPI sync green. Hosted CI check was IN_PROGRESS at assignment.
- Check against rules of engagement: §2 membership check on /me, §5 soft delete, §6 audit row in same transaction.
- Red notes hosted CI has no Postgres service, so the integration test skips in CI. If you agree that is a gap, open a BLUE task for a Postgres service in .github/** — not a blocker for this review.
Next owner after done: KABIR (merge). Then YELLOW's T021 wires signup + GET /me against the real API.
