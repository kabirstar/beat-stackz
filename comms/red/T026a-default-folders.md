# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T026a folder kind + default seeding

Status: done (implementation/local checks; pending review)
Commit/PR: red/t026a -> PR pending
Contract changes: none; implements Folder.kind/DEFAULT_FOLDERS from merged #29
Verification: 72 tests passed, zero skips (35 API + 22 worker Docker + 7 shared + 8 frontend)
Blockers: none for backend review; Yellow owns T026b icons/sorting
Next owner: BLUE (review/merge; remove shared Folder.kind .default(null) after merge), YELLOW (live UI acceptance)

Kabir directly authorized this work. Checked open/recent PRs, the bpackz-red
checkout, BRAIN logs/dispatch state: no T026a run existed; bpackz-red was clean
on completed T019. Claimed the task in Discord and worked only in this isolated
red-checkout. Parent main c1ae627. No shared/frontend/infra files edited.

Changes and behavior:
- backend/src/default-folders.ts bulk-inserts shared DEFAULT_FOLDERS (18 rows,
  five roots/thirteen children, parents before children) with random ids and
  createdBy=creating user. A single vault.seed_folders audit covers the seed.
- personal-vault.ts and POST /vaults invoke it inside their existing transaction.
  Folder/audit failure rolls back the entire signup/shared-vault operation.
- folders.kind is nullable, no SQL default, typed as shared FolderKind, with a
  database CHECK against its eighteen values. Drizzle's CommonJS loader cannot
  require the shared ESM export, so the SQL CHECK is literal; runtime seeding
  uses the shared constant. The migration freezes the same taxonomy.
- Existing row serializers already spread database fields: create/get/update/
  listChildren now emit kind explicitly. Tests inspect raw HTTP properties so
  shared .default(null) cannot hide a missing field. Request schemas unchanged;
  custom folders keep null, and supplied kind is stripped by the shared schema.
  Rename/move retain kind; trash stays trash; reads never reseed defaults.
- 0008_powerful_groot.sql adds the column/CHECK and backfills active vaults.
  Matching legacy folders stay unchanged/null; live matching roots may receive
  missing children. Skip deleted roots, existing/deleted names, active file
  collisions and their uncreatable subtrees. Do not rename/retag existing rows.
  One system audit per changed vault records inserted count. Repeat backfill
  is a no-op; lookup also recognizes stored kinds after default renames/moves.
  Table write locks protect cross-table names; run with the usual migration
  transaction before starting the new API. No application DB was migrated here.
- No new dependencies, polling, jobs or services. Runtime cost: one bulk insert
  and one audit per new vault. Backfill is one-time migration work, not startup
  reseeding. Existing T017/T018/T019 Red board entries marked merged.

Verification environment: Windows Node v24.21.0, pnpm 10.34.7, Docker PostgreSQL
17.11 + RustFS. Existing media binaries run in the worker image. Commands from
C:/Users/Kabir/Documents/ChatGPT/beat stacks/red-checkout:

```powershell
$env:TEST_DATABASE_URL='postgres://bpackz:bpackz@localhost:5432/bpackz_test'
$env:RUN_STORAGE_INTEGRATION='1'
node --env-file=infra/.env.example --input-type=module -e 'import {spawnSync} from "node:child_process"; process.exit(spawnSync("pnpm", ["-r", "--filter", "!worker", "--if-present", "test"], {shell:true, stdio:"inherit"}).status ?? 1);'
docker build -f worker/Dockerfile --target test -t bpackz-worker:t026a-test .
docker run --rm --network infra_default --env-file infra/.env.example -e TEST_DATABASE_URL=postgres://bpackz:bpackz@postgres:5432/bpackz_test -e RUN_STORAGE_INTEGRATION=1 -e S3_ENDPOINT=http://rustfs:9000 bpackz-worker:t026a-test
pnpm typecheck
pnpm lint
pnpm -F api db:check
pnpm -F api db:generate # no additional schema changes
docker build -f backend/Dockerfile -t bpackz-api:t026a .
```

Passed: signup/shared-vault exact tree/kinds/parents/actors, explicit Folder JSON,
rename/move persistence, custom kind protection, database invalid-kind rejection,
no trash recreation, audit failure rollback for signup and vault create. Upgrade
fixture tests preserve legacy file hash/key/refcount, existing folder timestamps,
file collisions, deleted roots/vaults, child fill under existing roots, repeat
backfill and audit-failure rollback including the column addition. Existing
uploads, shares, purge, real WAV/MP3/FLAC processing and recovery checks pass.

Typecheck/Drizzle checks clean; lint exit 0 with the existing warning in Blue's
infra/smoke.mjs (GET fetch body), untouched here. API image builds successfully.
Temporary test databases/buckets were removed by their suites. The running full
stack/other Red checkout were preserved; no new daemon was launched.

Worked example verified by HTTP: signup -> five default roots -> beats folder
PATCH name=Type beats and parentId=media id -> same id and kind=beats; a custom
folder POST with kind=songs still returns/stores kind=null. Browser icon/sort
acceptance and hosted deployment are not claimed. Shared contract's temporary
.default(null) remains Blue-owned and should be removed once T026a merges.
