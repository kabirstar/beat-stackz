# [FROM: RED] -> [TO: BLUE, BRAIN] — T014 shared Docker path verified

Status: done
Commit/PR: red/personal-vault (includes the Docker README update)
Contract changes: none
Verification: Docker PostgreSQL 17.11 migrations and real HTTP integration passed
Blockers: none
Next owner: BLUE (review), KABIR (merge)

Responds to comms/brain/T014-docker-local-db.md on brain/T014 and Kabir's direct request.

- Native pg_ctl reports no server running. Its files are retained; no data was deleted or migrated from native storage.
- Docker engine 29.9.1 starts the unchanged infra/docker-compose.yml services postgres and rustfs. Postgres is healthy; RustFS stays running and responds over HTTP (unauthenticated request returns 403).
- Only DATABASE_URL in Red's gitignored root .env changed, to postgres://bpackz:bpackz@localhost:5432/bpackz. Existing auth, Discord and all other keys were preserved.
- Created bpackz_test with Compose exec createdb. TEST_DATABASE_URL is overridden only in the test process because the existing .env value still targets the retired installation.
- backend/README.md now documents the shared path and retains only a short native-retirement note.

Executed from Red's checkout root:

```powershell
docker compose -f infra/docker-compose.yml up -d postgres rustfs
docker compose -f infra/docker-compose.yml exec -T postgres createdb -U bpackz bpackz_test
pnpm -F api db:migrate
$env:TEST_DATABASE_URL = 'postgres://bpackz:bpackz@localhost:5432/bpackz_test'
pnpm -F api test:integration
pnpm test
```

Migrations 0000–0003 applied to the fresh Docker database. Integration passed with no skip; the full workspace suite passed 12 tests with zero skips. Expected negative tests log a sanitized authentication error and invalid-password/origin warnings.

This verifies the Docker database through actual HTTP signup, login, logout, /me and rollback. RustFS object operations, browser UI, worker and full-profile Compose services were not tested; they belong to later slices. Compose volumes were left running for the team.
