# [FROM: RED] -> [TO: BLUE, YELLOW, BRAIN] — T012 vault, folder and file CRUD

Status: done
Commit/PR: red/vault-crud -> main (PR #8 foundation is merged)
Contract changes: none
Verification: 18 workspace tests passed with zero skips against Docker PostgreSQL 17.11; typecheck, lint, API build, db:check and OpenAPI sync passed
Blockers: review/merge only for this slice
Next owner: BLUE (review), YELLOW (wire vault/tree/metadata UI), KABIR (merge)

Blue approved #8 in https://github.com/kabirstar/beat-stackz/pull/8#issuecomment-6330115410 with no backend findings. His non-blocking mock-name alignment remains Blue-owned. T012 began only after that clearance.

Implemented existing shared contracts in backend/src/vault-routes.ts:

- Vault list/create/get/rename; shared-vault creation adds owner membership and audit rows atomically.
- Folder create/get (including breadcrumbs)/rename/move/recursive soft trash.
- Children listing, file metadata/rename/move/soft trash. File pagination is a stable id-ordered keyset; use nextCursor unchanged. Folders are unpaged.
- Active-user/vault membership checks on every route. Viewers read, owners/editors write, owner-only vault rename. Cross-vault file moves require writes in both vaults and preserve the blob; audit rows identify both spaces.
- Shared-schema validation at request and response boundaries, no-store responses, mutation Origin checks, sanitized server errors, 409 stale versions/name collisions/cycles. Timestamps use millisecond precision and advance monotonically for optimistic edits.

Migration 0004 adds folders, blobs and files per architecture, with active-name unique indexes covering NULL/root parents and lookup indexes. The application also prevents file/folder cross-type collisions to match shared mocks. Deleted names are reusable. Earlier migrations are unchanged; db:generate reports no additional schema changes.

Mutations serialize on vault-row locks, acquired in id order for cross-vault moves. This keeps validation and audit writes in one transaction and prevents concurrent folder cycles or creation beneath a concurrently trashed parent. Future upload/invite writers must use the same lock discipline; finer locking is unnecessary until contention is measured. Recursive trash writes an audit row for every affected folder/file and keeps blob ref_count unchanged until purge.

Real HTTP tests cover four users, roles and isolation, malformed requests/origin rejection, folder breadcrumbs/cross-vault parents, simultaneous stale edits, root collisions, simultaneous opposing folder moves, file paging, denied and successful cross-vault moves, opposing file moves, recursive trash, trash/create races, deleted-account/vault rejection and rollback when audit insertion fails. Membership/blob/file fixtures are inserted directly because their creation APIs are later tasks. Test files run serially to avoid interfering with auth's database-wide rollback counts.

Commands (from root; Docker services already running):

```powershell
pnpm -F api db:migrate
$env:TEST_DATABASE_URL = 'postgres://bpackz:bpackz@localhost:5432/bpackz_test'
pnpm -F api test:integration # 7 passed including subtests, zero skipped
pnpm test                   # 18 passed including subtests, zero skipped
pnpm typecheck
pnpm lint
pnpm -F api build
pnpm -F api db:check
pnpm -F api db:generate --name verify-vault-crud # no changes
pnpm openapi                # generated contract unchanged
```

Not included: member invite/remove routes, file creation (T013 upload completion), presigned download, sharing, waveform, restore/purge, or vault deletion (no shared contract). Hosted CI still skips database tests without TEST_DATABASE_URL; non-skipped evidence is local Docker. Browser integration and large-vault performance are unverified.
