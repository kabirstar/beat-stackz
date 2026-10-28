# [FROM: RED] -> [TO: BLUE, BRAIN, YELLOW] — T081 server-enforced invite code on sign-up

Status: done (implementation + local checks; pending Blue review)
Commit/PR: red/t081 -> PR #58 https://github.com/kabirstar/beat-stackz/pull/58
Contract changes: none; implements `SignUpBody` from merged #55 (ADR 0003)
Verification: `pnpm -F api test` with TEST_DATABASE_URL + RUN_STORAGE_INTEGRATION=1 -> 35 passed, 0 skipped; `pnpm typecheck` api/worker clean; `pnpm lint` exit 0 (pre-existing smoke.mjs warning only)
Blockers: none for backend review. Blue: `infra/smoke.mjs` signs up without `inviteCode` and will get 400 once this merges; add `inviteCode` (any value when INVITE_CODE is unset, the env value otherwise). Not edited here (infra is Blue's).
Next owner: BLUE (review/merge, smoke.mjs one-liner) -> KABIR (set `INVITE_CODE` in Coolify, deploy) -> YELLOW (T082 door sends `inviteCode`)

Spec followed verbatim from `comms/blue/T080-invite-code.md` §RED.

Changes:
- `backend/src/config.ts`: reads `INVITE_CODE`. Required when `NODE_ENV=production` (same guard style as
  `BETTER_AUTH_SECRET`); optional in development, where unset means any code is accepted.
- `backend/src/auth.ts`: Better Auth `hooks.before` on `/sign-up/email` only. Parses the raw body with the
  shared `SignUpBody`; failure -> 400 `{error:"invalid", message:"Invalid sign-up body"}` (no field echo).
  If `INVITE_CODE` is set and the code differs (sha256 both sides, `timingSafeEqual`) -> one `audit_log` row
  `auth.signup_rejected` with null actor/vault/meta (no code, no email), then 403
  `{error:"forbidden", message:"Invite code not recognized"}` (shared `ApiError` shape). On success the hook
  strips `inviteCode` from the body before Better Auth sees it; nothing is stored, no `additionalField`.
  Sign-in and every other auth route are untouched (hook returns early on path).
- Tests: `auth.test.ts` covers production-requires-INVITE_CODE, dev-unset config, missing `inviteCode` -> 400
  with zero DB connections. `auth.integration.test.ts` runs the whole suite with a real code: wrong -> 403 +
  exact body + audit row shape + no user created; missing -> 400; right -> 200 and no stored code; a second
  app with `inviteCode` unset accepts an arbitrary code. Other integration suites (vault, uploads, sharing,
  taxonomy, worker verify) now send `inviteCode` since the contract requires the field.

Assumptions (unattended run):
- "Missing field -> 400" applies even when `INVITE_CODE` is unset: the shared contract marks it required, and
  the door (T082) always sends it. Dev convenience is "any code", not "no code". Cheap to relax if Kabir prefers.
- `audit.signup_rejected` is a single insert outside any transaction: a rejection mutates nothing else.

Not done / out of scope: `infra/smoke.mjs` (Blue), frontend door (Yellow T082), Coolify env (Kabir).
