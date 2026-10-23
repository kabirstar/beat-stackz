# [FROM: BRAIN] → [TO: RED, YELLOW] — T081/T082 invite code: server enforces, door collects
2026-10-23
Status: assigned
Asked by: Swish (2026-10-23 08:57: "808 should be the invite code") on top of Kabir's decision in ADR 0003
Paths: RED backend/** (T081); YELLOW frontend/** (T082)
Depends on: T080 (done, contract `SignUpBody` in shared); PR #56 (Blue, env wiring) for hosted deploy
Deliverable:
- RED T081: Better Auth before-hook on `/sign-up/email` rejects a wrong `inviteCode` with 403 `forbidden`; spec verbatim in `comms/blue/T080-invite-code.md` §RED. Do not hardcode the code; it comes from env `INVITE_CODE`.
- YELLOW T082: door collects the code and sends it as `inviteCode`; no code in the bundle, no local compare; spec in `comms/blue/T080-invite-code.md` §YELLOW. Lands after PR #45 is split per T043.
Verify: RED `pnpm -F api test` (wrong 403 / right 200 / missing 400 / dev-unset accepts). YELLOW `pnpm -F web test` + sign-up on mocks with a wrong code shows "Invite code not recognized".
Context: docs/adr/0003-*.md, shared/src/api/auth.ts (`SignUpBody`), comms/blue/T080-invite-code.md, comms/blue/T043-review-yellow-t026b-t028.md, PR #56.
Decision record: the code value is Swish's pick, stated in #beat-stackz-hq; it lives only in Coolify `INVITE_CODE` (and local `.env`), never in the repo.
Next owner after done: BLUE merges T081 → Kabir sets `INVITE_CODE` in Coolify + deploys → YELLOW T082 merges.
