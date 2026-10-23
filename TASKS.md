# TASKS

Edit only your own section. Entry format in AGENTS.md → Comms.

## KABIR & SWISH
- [x] GitHub repo created and pushed (Yellow)
- [x] Confirm scope: file vault, no marketplace (2026-10-21)
- [x] Install Docker Desktop on the PC (verified by Red, #8)
- [x] `gh auth login` on the PC
- [x] Share the core vision (2026-10-23: artists + producers; creating, sharing, marketing music → AGENTS.md, ADR 0002)
- [ ] 2-3 reference sites whose feel you want (for Yellow)
- [x] Folder taxonomy (2026-10-23: Yellow's icon tree is the default for every vault, ADR 0002)

## BLUE
- [x] T001 [BLUE] repo skeleton: AGENTS.md, docs, infra, shared schemas (on main)
- [x] T002 [BLUE] CI: typecheck, lint, test, shared build, openapi gen
      paths: .github/**  depends: T001  verify: green on PR
- [x] T003 [BLUE] MSW handlers generated from shared schemas for Yellow
      paths: shared/src/mocks/**  depends: T001  verify: pnpm -F @bpackz/shared test
- [x] T004 [BLUE] BRAIN coordinator agent + Discord loop + delegate/spawn skills (PR #5, dry run verified)
      paths: brain/**, .claude/**  depends: none  verify: py brain/brain.py --once "<q>" answers from TASKS/COMMS/PRs
- [x] T007 [BLUE] upload integrity policy: ADR 0001, FileItem.status, scoped dedup, opaque keys (unblocks T013)
      paths: shared/**, docs/**  depends: none  verify: pnpm -F @bpackz/shared test (6/6)

- [x] T026 [BLUE] default folder taxonomy: ADR 0002, Folder.kind, DEFAULT_FOLDERS, mocks seed (PR open)
      paths: shared/**, docs/**  depends: none  verify: pnpm -F @bpackz/shared test

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
- [x] T011 [RED] migrations for schema in docs/ARCHITECTURE.md §3; personal vault on signup
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
- [x] T012 [RED] vaults + folders + files CRUD per shared contract
      paths: backend/**  depends: T011  verify: pnpm -F api test
      status: approved by Blue and merged in PR #10; validation issues follow-up on red/uploads
      deliverable: vault list/create/get/rename, folder CRUD/breadcrumbs, children/file metadata/moves/trash, migration 0004
      verification: 18 workspace tests passed, zero skipped on Docker PostgreSQL; see comms/red/T012-vault-crud.md
- [x] T013 [RED] presigned multipart: create/sign/complete/abort + presigned GET
      paths: backend/**  depends: T012  verify: pnpm -F api test
      status: approved by Blue and merged in PR #14; T015 verification follows
      verification: 27 local tests passed with PostgreSQL + RustFS enabled, zero skips; upgrade/retry recovery included
      blocker: none for API review; T015 worker is needed to promote new uploads from processing to ready
      handoff: comms/red/T013-upload-endpoints.md; policy resolved by Blue ADR 0001

- [x] T015 [RED] verification worker per ADR 0001
      paths: worker/**, backend/**  depends: T013 (merged PR #14)
      status: approved by Blue and merged in PR #23; T016 explicitly cleared
      deliverable: hash uploaded bytes, enforce claimed hash, ready/failed transitions and verified late-dedup with audits; retain completion receipts; abort expired intents
      verify: TEST_DATABASE_URL=... RUN_STORAGE_INTEGRATION=1 pnpm -F worker test; pnpm typecheck; pnpm lint
      verification: 37 workspace tests passed, zero skips; 10 worker checks include killed-process recovery and real presigned download
      handoff: comms/red/T015-verification-worker.md

- [x] T016 [RED] audio duration and waveform JSON
      paths: worker/**, backend/**  depends: T015 (merged PR #23)
      status: approved by Blue and merged in PR #26; Docker worker CI green
      deliverable: streamed ffprobe/ffmpeg/audiowaveform, canonical blob peaks, existing private waveform route; preserve verified downloads on audio failure
      verify: Docker worker test target with TEST_DATABASE_URL + RUN_STORAGE_INTEGRATION=1; pnpm typecheck; pnpm lint
      verification: 16 worker checks passed with real Docker PostgreSQL/RustFS and audio tools, zero skips
      handoff: comms/red/T016-waveforms.md
- [ ] T026a [RED] folders.kind migration + seed the 18-folder default tree on signup and vault create; backfill where name free
      paths: backend/**  depends: T026  deliverable: per comms/blue/T026-default-taxonomy.md  verify: pnpm -F api test

- [ ] T017 [RED] existing-user invites, file shares and 30-day trash purge
      paths: backend/**, worker/**  depends: T013/T015/T016 (merged)
      status: implemented on red/sharing / PR #30; awaiting Blue review
      deliverable: members/invite/removeMember; shares.* and token download/waveform; recovery-safe purge
      verify: API integration with TEST_DATABASE_URL + RUN_STORAGE_INTEGRATION=1; worker Docker test target
      handoff: comms/red/T017-members-shares-purge.md
- [ ] T018 [RED] backend Dockerfile
      paths: backend/Dockerfile, backend/README.md  depends: T017
      status: image built and smoke-tested on Docker PostgreSQL/RustFS; Blue owns T034 endpoint wiring
      deliverable: compiled API image, startup migrations, unprivileged server
      verify: docker compose -f infra/docker-compose.yml build api; container HTTP/auth/share/download/revoke and SIGTERM
      handoff: comms/red/T017-members-shares-purge.md

## YELLOW
- [x] T020 [YELLOW] scaffold frontend (Vite + React 19 + TS + Tailwind), consume @bpackz/shared client on mocks
      paths: frontend/**  depends: T003  verify: pnpm -F web dev boots
      deliverable: typed @bpackz/shared API client + MSW handlers with playable 6s synth WAV buffer
      handoff: comms/yellow/T020-T022-ui-design-and-audit.md
- [x] T021 [YELLOW] login/signup, vault switcher, 3D hardware folder grid, separated Studio Mono file cards, reusable components
      paths: frontend/**  depends: T020  verify: pnpm -F web typecheck && pnpm -F web test
      deliverable: modular reusable UI components (StudioPrimitives, VaultHeader with Shared Vaults dropdown, StudioFileSection, VaultModals, BottomTransportPlayer), Panchang Wide + Satoshi headings, Studio Mono file titles, Aston Spirit 3D mic, Shared Vault main-page 3D Rap Icons (Lean Cup, Diamond Chain, $100K Cash Stack, Lambo, Bust-Down Watch), Swish/Todo/Shared themes
      handoff: comms/yellow/T020-T022-ui-design-and-audit.md
- [x] T022 [YELLOW] uploader (presigned S3 multipart + real WebCrypto SHA-256 + 64 MiB part slicing) + FileItem.status (processing/ready/failed) polling + real <audio> player + share sheet + trash
      paths: frontend/**  depends: T021, T012, T013  verify: pnpm -F web typecheck && pnpm -F web test && pnpm -F web build
      deliverable: StudioFileCard processing/failed states, automatic files.get polling while processing, real SHA-256 + multipart slicing for T013/T015, VaultMember owner resolution, and presigned <audio> playback
      handoff: comms/yellow/T020-T022-ui-design-and-audit.md
- [x] T023 [YELLOW] publish the solidified UI feature list, each line mapped to a shared route or marked NEW
      paths: comms/yellow/T023-feature-list.md, frontend/**  depends: none
      deliverable: comms/yellow/T023-feature-list.md on PR #21 (route names updated per Blue's T009 gap-check)
      verify: file pushed; Discord ping
      handoff: comms/yellow/T023-feature-list.md
- [x] T024 [YELLOW] public share landing view (/s/:token via shares.resolve + ?token= waveform/download), member removal (vaults.removeMember), vault/file rename, and frontend/Dockerfile for T009 compose run
      paths: frontend/**, comms/yellow/**  depends: T022, T009  verify: pnpm -F web typecheck && pnpm -F web test && pnpm -F web build
      deliverable: PublicShareLandingModal + URL /s/:token auto-resolve, CollaboratorsModal removeMember/rename, ShareContextSheet inline file rename, frontend/Dockerfile + frontend/nginx.conf
      handoff: comms/yellow/T024-shares-and-dockerfile.md
- [ ] T026b [YELLOW] key icons by folder.kind (name fallback for null); defaults first in DEFAULT_FOLDERS order
      paths: frontend/**  depends: T026  deliverable: per comms/blue/T026-default-taxonomy.md  verify: pnpm -F web test

## BRAIN
- [x] T090 [BRAIN] first live run on #beat-stackz-hq (live since 2026-10-22)
      paths: comms/brain/**  depends: Kabir runs `py brain/brain.py` on the PC
      deliverable: BRAIN answers a status question in Discord from TASKS/COMMS/PRs
      verify: reply appears as BRAIN within a minute of the question
- [x] T006 [BLUE] review PR #8: T011 personal vault + T014 Docker switch (approved, merged)
      paths: review only  depends: PR #7 merged  assigned-by: BRAIN
      deliverable: GitHub review on PR #8 (focus: Better Auth tx extension in backend/src/auth.ts, 0003 backfill)
      verify: gh pr view 8 --repo kabirstar/beat-stackz --json reviews shows BLUE's review
      handoff: comms/brain/T006-review-pr8.md
- [x] T007 [BLUE] decide dedup authorization + trusted-hash policy for T013 uploads; review PR #14 (ADR 0001, #15)
      paths: shared/src/api/uploads.ts, docs/adr/**, docs/ARCHITECTURE.md; review on PR #14  depends: PR #14 (draft)  assigned-by: BRAIN
      deliverable: ADR + shared contract change (or explicit none) + GitHub review on PR #14; Red resumes T013 after
      verify: docs/adr/NNNN-*.md exists; pnpm -F @bpackz/shared test; gh pr view 14 --repo kabirstar/beat-stackz --json reviews shows BLUE
      handoff: comms/brain/T007-upload-integrity-policy.md
- [x] T008 [BLUE] review PR #14: T013 upload API slice (bc1162d + b7a638a; 01:43 comment covered only the foundation) (done: #14 merged, #21 changes requested)
      paths: review only  depends: T007 (#15–#17 merged)  assigned-by: BRAIN
      deliverable: GitHub review on PR #14; merge on green CI or request changes via comms/blue/ (focus: S3/DB recovery boundary, dedup authz, receipt retention, migration 0005)
      verify: gh pr view 14 --repo kabirstar/beat-stackz --json reviews,state shows BLUE's review
      handoff: comms/brain/T008-review-pr14-pr21.md
- [ ] T015 [RED] verification worker per ADR 0001 (hash, ready/failed, late-dedup, expired intents; no ffmpeg yet)
      paths: worker/**, backend/**  depends: T008 (Blue clears + merges #14)  assigned-by: BRAIN
      status: hold lifted 2026-10-22 04:48 — Red reports Kabir's go in Red's chat, conditional on #14 clearance; Kabir/Swish may veto in #brain-updates
      deliverable: worker claims verify jobs, streams+hashes once, applies ADR transitions with audits under vault-lock; aborts expired intents
      verify: worker integration command Red adds — match/mismatch/retry/late-dedup/expired, zero skips on Docker Postgres + RustFS
      handoff: comms/brain/T015-verification-worker.md
- [ ] T023 [YELLOW] publish the solidified UI feature list, each line mapped to a shared route or marked NEW
      paths: comms/yellow/T023-feature-list.md, frontend/**  depends: none  assigned-by: BRAIN
      deliverable: comms/yellow/T023-feature-list.md on a yellow/ branch; T020 scaffold PR if the UI exists (frontend/ is empty on main)
      verify: file pushed; Discord ping
      handoff: comms/brain/T023-feature-list.md
- [ ] T017 [RED] vault members + share links + trash purge per shared contract (after T013; no hold — routes already contracted)
      paths: backend/**, worker/** (purge only)  depends: T013  assigned-by: BRAIN
      deliverable: vaults.members/invite/removeMember; shares.*; ?token= on download/waveform; 30-day purge job
      verify: pnpm -F api test; CI Docker integration green
      handoff: comms/brain/T017-members-shares-purge.md
- [x] T009 [BLUE] gap-check Yellow's T023 list vs shared/src/api; contract change or "no" per NEW item (none needed; comms/blue/T009-feature-gap-check.md)
      paths: shared/**, docs/**  depends: T023 (after T008)  assigned-by: BRAIN
      deliverable: comms/blue/T009-*.md with item → route; shared + mocks updated for accepted items
      verify: pnpm -F @bpackz/shared test
      handoff: comms/brain/T009-feature-gap-check.md
