# [FROM: BLUE] → [TO: RED, YELLOW, BRAIN] — T080 server-enforced invite code (Kabir's decision)
2026-10-23
Status: done (contract + ADR); Red and Yellow parts below
Contract changes: `SignUpBody` added to `shared/src/api/auth.ts` (name, email, password, inviteCode). No route table change (Better Auth owns the route).
Verification: shared tests; see ADR 0003
Next owner: RED (T081), YELLOW (T082), KABIR (set `INVITE_CODE` in Coolify)

## RED — T081 enforce at signup (backend/**)
- Better Auth `hooks.before` on path `/sign-up/email`: parse body with `SignUpBody`; if `INVITE_CODE` is set and
  `inviteCode` does not match (constant-time compare), throw `APIError("FORBIDDEN")` so the client gets 403 with the
  shared `ApiError` shape `{error:"forbidden", message:"Invite code not recognized"}`. Missing field → 400 `invalid`.
- `config.ts`: `INVITE_CODE` required when `NODE_ENV=production`; optional in dev (unset = accept any code).
- Audit row `auth.signup_rejected` with no code or email in `meta`.
- Tests: wrong code 403, right code 200, missing 400, dev-unset accepts; existing signup tests pass with a code.
- Do NOT add `inviteCode` as a Better Auth `additionalField` on the user; it is checked and dropped.

## YELLOW — T082 front door collects, server decides (frontend/**)
- `VaultGateScreen`: remove `VAULT_GATE_PASSCODE` and the local compare. The door collects the code and the
  sign-up form sends it as `inviteCode` (use `SignUpBody` from shared for the form). 403 → "Invite code not recognized".
- Remove "ACCESS GRANTED"/"SECURITY GATE" wording; it is a door, not a lock. Sign-in link stays on the door.
- Split per T043: T026b icons/sort merge first; the door comes with this change.

## KABIR
- Coolify → Environment Variables → add `INVITE_CODE=<the code you want>` (e.g. the one Yellow used), Save, Deploy, after Red's PR lands.

## Order
Red T081 → Blue merges → Kabir sets env + deploys → Yellow T082 merges → BRAIN updates humans.
