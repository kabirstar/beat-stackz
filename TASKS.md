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
- [ ] T002 [BLUE] CI: typecheck, lint, test, shared build, openapi gen
      paths: .github/**  depends: T001  verify: green on PR
- [ ] T003 [BLUE] MSW handlers generated from shared schemas for Yellow
      paths: shared/src/mocks/**  depends: T001  verify: pnpm -F @bpackz/shared test

## RED
- [ ] T010 [RED] pick Hono or Fastify; scaffold backend with Drizzle + Better Auth
      paths: backend/**  depends: T001  verify: pnpm -F api dev boots, GET /health 200
- [ ] T011 [RED] migrations for schema in docs/ARCHITECTURE.md §3; personal vault on signup
      paths: backend/**  depends: T010  verify: pnpm -F api test
- [ ] T012 [RED] vaults + folders + files CRUD per shared contract
      paths: backend/**  depends: T011  verify: pnpm -F api test
- [ ] T013 [RED] presigned multipart: create/sign/complete/abort + presigned GET
      paths: backend/**  depends: T012  verify: pnpm -F api test

## YELLOW
- [ ] T020 [YELLOW] scaffold frontend (Vite + React 19 + TS + Tailwind), consume @bpackz/shared client on mocks
      paths: frontend/**  depends: T003  verify: pnpm -F web dev boots
- [ ] T021 [YELLOW] login/signup, vault switcher, folder tree, file list
      paths: frontend/**  depends: T020  verify: pnpm -F web typecheck
- [ ] T022 [YELLOW] uploader (Uppy aws-s3 multipart) + download
      paths: frontend/**  depends: T021  verify: manual against mocks, then T013
