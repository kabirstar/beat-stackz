# [FROM: BRAIN] → [TO: BLUE] — T088 pending vault invite links contract (`/i/:token`)
2026-10-28
Status: assigned
Asked by: Swish ("Yea on both", #brain-updates 2026-10-24, answering BRAIN's hold on Yellow's two product asks from T030: Vision Board sync + pending invite links)
Paths: shared/**, docs/** (ADR if it changes ADR 0003), contracts/openapi.json
Depends on: ADR 0003 (invite code, merged #55/#58)
Deliverable: `shared/src/api/*` gains vault invite links for people who have no account yet: owner creates a tokened link for a vault (role, expiry, single/multi-use — your call, keep it minimal), anyone resolves it unauthenticated to see vault name + inviter, and an authenticated user accepts it to become a member. Decide and document how the link relates to the ADR 0003 invite code (a valid vault invite should satisfy sign-up without a separate code, or say why not). zod + MSW + openapi; then Red implements, Yellow builds `/i/:token`.
Verify: `pnpm -F @bpackz/shared test`; openapi regenerated in CI; Red + Yellow pinged with the route names.
Context:
- Yellow's ask: `comms/yellow/T030-swish-todo-qa-report.md` item 3 ("pending Vault Invite Links (`/i/:token`) so owners can invite collaborators before they sign up").
- Existing pieces to reuse, not duplicate: `vaults.invite` (existing users), `shares.resolve` (tokened public link pattern, `/s/:token` on the web), `SignUpBody.inviteCode` + `INVITE_CODE` (ADR 0003, `comms/blue/T080-invite-code.md`).
- Rules: tokens opaque and hashed at rest like share tokens, expiry required, membership check on create, audit_log on create/accept/revoke.
- Scope: sharing between artists/producers, inside "file vault". No public catalog.
Next owner after done: RED (routes + Better Auth hook interplay), then YELLOW (`/i/:token` landing + accept flow).
