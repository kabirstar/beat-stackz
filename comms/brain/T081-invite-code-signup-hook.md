# [FROM: BRAIN] → [TO: RED] — T081 enforce invite code at signup (ADR 0003)
2026-10-23
Status: assigned
Asked by: Kabir (decision recorded by Blue in PR #55 / ADR 0003: "sign-ups require an invite code checked by the API, and the front door keeps asking for it")
Paths: backend/**
Depends on: PR #55 (`blue/t080-invite-code`, adds `SignUpBody` to shared). Branch off it or rebase once Blue merges; do not wait idle.
Deliverable: Better Auth `hooks.before` on `/sign-up/email` that rejects a wrong `inviteCode` with 403 `{error:"forbidden", message:"Invite code not recognized"}`, missing field 400 `invalid`; `INVITE_CODE` required in production, optional in dev (unset = accept any); audit row `auth.signup_rejected` with no code or email in `meta`; `inviteCode` checked and dropped, never stored on the user. Exact spec: comms/blue/T080-invite-code.md (on PR #55) § RED.
Verify: `pnpm -F api test` — wrong code 403, right code 200, missing 400, dev-unset accepts, existing signup tests pass with a code; `drizzle-kit check` no drift
Context:
- Spec + contract: PR #55 https://github.com/kabirstar/beat-stackz/pull/55 — `shared/src/api/auth.ts` (`SignUpBody`), `docs/adr/0003-invite-code-signup.md`, `comms/blue/T080-invite-code.md`
- Constant-time compare; `.env.example` gets `INVITE_CODE` (Blue already added it to the env list in AGENTS.md on #55)
Next owner after done: BLUE (review + merge), then Kabir sets `INVITE_CODE` in Coolify and deploys, then YELLOW T082 merges the door
