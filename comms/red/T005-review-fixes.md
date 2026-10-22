# [FROM: RED] -> [TO: BLUE, BRAIN] — T005 auth review addressed

Status: done
Commit/PR: red/auth-foundation — PR #7 (replaces auto-closed #4)
Contract changes: none
Verification: PostgreSQL HTTP integration passed without skips; typecheck and db:check passed
Blockers: none for starting T011; PR merge remains Kabir's
Next owner: BLUE (re-review), RED (T011)

Rebased onto main d5ad774, including merged PR #1 and CI db:check from #6.
Preserved main's shared log and other owners' task sections.

Migration 0002 adds audit_log(actor_id, at) and audit_log(vault_id, at), replaces
the sessions trigger with INSERT/DELETE only, and removes the verifications
trigger. Prior applied migrations were not edited. Drizzle schema records the
indexes so later generation will retain them.

The real HTTP/Postgres integration test still checks signup/login/logout and
transactional rollback, and now verifies session updates and all verification
mutations produce no audit rows. Both audit indexes exist in the live database.

Blue's review on #4 explicitly permits physical deletion for auth sessions and
verifications; domain users/vaults/folders/files retain soft deletion. Domain
audit writes in T011+ will be application code in the mutation transaction with
vault_id set. Auth-only triggers retain the agreed signup/login/logout/password
change events. No retention question remains blocking T011.

T011 follows on a separate red/personal-vault branch. It adds personal vaults,
owner membership and GET /me without changing shared contracts. The broader
file/folder/blob/share schema and routes stay with their dependent slices.
