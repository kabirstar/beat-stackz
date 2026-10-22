# TASKS

Edit only your own section. Entry format in AGENTS.md → Comms.

## KABIR & SWISH
- [x] GitHub repo created and pushed (Yellow)
- [x] Confirm scope: file vault, no marketplace (2026-10-21)
- [ ] Install Docker Desktop on the PC (Red needs Postgres + RustFS)
- [ ] `gh auth login` on the PC
- [ ] Share the core vision: what makes Beat Stackz different, target vibe, 2-3 reference sites
- [ ] Folder taxonomy per artist (stems / masters / artwork / contracts / splits?)

## BLUE
- [x] T001 [BLUE] repo skeleton: AGENTS.md, docs, infra, shared schemas (on main)
- [x] T002 [BLUE] CI: typecheck, lint, test, shared build, openapi gen
      paths: .github/**  depends: T001  verify: green on PR
- [x] T003 [BLUE] MSW handlers generated from shared schemas for Yellow
      paths: shared/src/mocks/**  depends: T001  verify: pnpm -F @bpackz/shared test
- [x] T004 [BLUE] BRAIN coordinator agent + Discord loop + delegate/spawn skills (PR #5, dry run verified)
      paths: brain/**, .claude/**  depends: none  verify: py brain/brain.py --once "<q>" answers from TASKS/COMMS/PRs

## RED
- [x] Verify PC environment and clone isolated Red checkout; GitHub CLI auth works outside sandbox
- [x] T010a [RED] Hono health/CORS scaffold in backend; PR #1 workspace review fixes
      paths: backend/**, pnpm-lock.yaml  depends: T001
      deliverable: api workspace package, root lockfile, GET /health on :4000
      verify: pnpm -F api test; pnpm -F api typecheck; pnpm -F api build; pnpm -F api dev + GET /health 200
- [x] T010b [RED] shared validators, Drizzle + Better Auth integration
      paths: backend/**  depends: T010a
      deliverable: authenticated API foundation against shared/src/api contracts
      status: PR #7 merged; T005 audit review fixes included
      verify: pnpm -F api test; pnpm -F api db:check; TEST_DATABASE_URL=... pnpm -F api test:integration
      verification: Docker Postgres 17.11 migrations + real HTTP auth passed; 12 tests passed, none skipped
      blockers: none; see comms/red/T005-review-fixes.md
- [ ] T011 [RED] migrations for schema in docs/ARCHITECTURE.md §3; personal vault on signup
      paths: backend/**  depends: T010b  verify: pnpm -F api test
      status: personal-vault slice approved by Blue and merged in PR #8
      deliverable: vaults/members migration + active-user backfill; atomic signup provisioning and GET /me
      verification: Docker HTTP integration covers ownership, duplicate prevention, rollback and session revocation
      remaining: other domain tables land with their dependent route slices; see comms/red/T011-personal-vault.md
- [x] T014 [RED] switch local database to shared Docker Compose
      paths: backend/README.md, comms/red/**, local .env  depends: Docker engine
      deliverable: native database stopped; Docker Postgres + RustFS running; DATABASE_URL updated alone
      verify: pnpm -F api db:migrate; TEST_DATABASE_URL=... pnpm -F api test:integration
      verification: passed on Docker PostgreSQL 17.11; see comms/red/T014-docker-local-db.md
- [ ] T012 [RED] vaults + folders + files CRUD per shared contract
      paths: backend/**  depends: T011  verify: pnpm -F api test
      status: implemented on red/vault-crud; awaiting Blue review and Kabir merge
      deliverable: vault list/create/get/rename, folder CRUD/breadcrumbs, children/file metadata/moves/trash, migration 0004
      verification: 18 workspace tests passed, zero skipped on Docker PostgreSQL; see comms/red/T012-vault-crud.md
- [ ] T013 [RED] presigned multipart: create/sign/complete/abort + presigned GET
      paths: backend/**  depends: T012  verify: pnpm -F api test

## YELLOW
- [ ] T020 [YELLOW] scaffold frontend (Vite + React 19 + TS + Tailwind), consume @bpackz/shared client on mocks
      paths: frontend/**  depends: T003  verify: pnpm -F web dev boots
- [ ] T021 [YELLOW] login/signup, vault switcher, folder tree, file list
      paths: frontend/**  depends: T020  verify: pnpm -F web typecheck
- [ ] T022 [YELLOW] uploader (Uppy aws-s3 multipart) + download
      paths: frontend/**  depends: T021  verify: manual against mocks, then T013

## BRAIN
- [ ] T090 [BRAIN] first live run on #beat-stackz-hq
      paths: comms/brain/**  depends: Kabir runs `py brain/brain.py` on the PC
      deliverable: BRAIN answers a status question in Discord from TASKS/COMMS/PRs
      verify: reply appears as BRAIN within a minute of the question
- [x] T006 [BLUE] review PR #8: T011 personal vault + T014 Docker switch (merged 2026-10-22)
      paths: review only  depends: PR #7 merged  assigned-by: BRAIN
      deliverable: GitHub review on PR #8 (focus: Better Auth tx extension in backend/src/auth.ts, 0003 backfill)
      verify: gh pr view 8 --repo kabirstar/beat-stackz --json reviews shows BLUE's review
      handoff: comms/brain/T006-review-pr8.md
