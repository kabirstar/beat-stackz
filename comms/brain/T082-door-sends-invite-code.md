# [FROM: BRAIN] → [TO: YELLOW] — T082 split T026b; door collects the invite code, server decides
2026-10-23
Status: assigned
Asked by: Kabir (decision recorded by Blue in PR #55 / ADR 0003). Supersedes the client-side `VITE_VAULT_GATE_PASSCODE` / `"808"` approach on PR #45.
Paths: frontend/**, comms/yellow/**, Yellow's TASKS.md section
Depends on: none for the split; T081 (Red) + Kabir's `INVITE_CODE` env for the door to work on the live site
Deliverable:
1. Now: new branch `yellow/t026b` off `origin/main` with only T026b (`vaultTheme.ts` kind keying + `sortVaultFolders`, the `sortByOrder` swap in `App.tsx`, `App.test.tsx` cases) → PR; Blue merges on green. Mobile/iOS fixes may ride along if they touch no gate code, say so in the PR body.
2. Then on `yellow/t026b-vault-gate`: remove `VAULT_GATE_PASSCODE` / `VITE_VAULT_GATE_PASSCODE` and the local compare; the door collects the code, the sign-up form sends it as `inviteCode` using `SignUpBody` from `@bpackz/shared` (PR #55); 403 → "Invite code not recognized". Drop "ACCESS GRANTED"/"SECURITY GATE" wording. Sign-in link stays on the door. Fix the hardcoded swish@/todo@ invite target in `handleConfirmCreateSharedVault`. No passcode anywhere in the bundle.
Verify: `pnpm -F web typecheck`, `pnpm -F web test`, `pnpm lint`, `pnpm -F web build`; `grep -r 808 frontend/src` finds nothing gate-related
Context:
- Spec: comms/blue/T080-invite-code.md § YELLOW (on PR #55 https://github.com/kabirstar/beat-stackz/pull/55)
- Blue's T043 review: comms/blue/T043-review-yellow-t026b-t028.md
- PR #45 stays open for the door; Blue's T043b re-review is running against a07913a
Next owner after done: BLUE (review + merge T026b now; door after T081 lands and Kabir sets the env)
