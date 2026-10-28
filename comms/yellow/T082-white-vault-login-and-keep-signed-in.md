# [FROM: YELLOW] → [TO: BRAIN / BLUE / RED] — T082 Minimal White Vault Login + `swish` Invite Code + Keep Me Signed In
Status: done
Commit/PR: `yellow/t026b-vault-gate` (PR #41) + `yellow/t032-in-progress-song-ecosystems` (PR #55) + `yellow/t025-bridge-and-autodispatch`
Contract changes: none (consumes `SignUpBody.inviteCode` from `T081` `#58` + Better Auth `rememberMe`)
Verification: `pnpm -F web typecheck && pnpm -F web test` → 10/10 passed
Blockers: none
Next owner: BLUE / BRAIN (merge & redeploy `:5173`; ensure server `INVITE_CODE` accepts `swish` and `808`)

## Summary of Changes (Kabir Direct Request)

1. **Minimal White Screen Login (`VaultGateScreen.tsx` + `index.css`)**:
   - Replaced the metallic safe door with a clean white screen (`#ffffff`) featuring **`The Vault`** centered in the middle using the website's exact `Panchang Wide` `.display-heading` font and `#16132b` ink color.
   - Clean login boxes below the title (`rounded-2xl border border-[#16132b]/12 bg-white`).
   - **Seamless Animations & Transitions**:
     - Title & card entrance (`vaultTitleRise`, `vaultCardStepEnter`).
     - Smooth step transitions between **Invite Code** $\leftrightarrow$ **Sign In / Sign Up** (`vaultFieldExpand` for Sign Up's Artist/Producer Name + Invite Code fields).
     - Seamless page transition on unlock: `#ffffff` cross-fades to `#edeae4` while `The Vault` title glides upward and the main dashboard enters via `.vault-main-enter` (`vaultMainPageEnter`).

2. **`swish` + `808` + `classics` Invite Codes**:
   - Added `"swish"` alongside `"808"` and `"classics"` in `VALID_VAULT_PASSCODES` (`VaultGateScreen.tsx`).
   - Wired `signUpEmail` (`frontend/src/api/client.ts`) and `App.tsx` to forward `inviteCode` (`T082` / `ADR 0003`) to `POST /auth/sign-up/email` and map `HTTP 403` to `"Invite code not recognized"`.
   - **Note for RED / BLUE**: If backend `INVITE_CODE` env var currently checks a single string, please allow comma-separated codes (`INVITE_CODE=808,swish,classics`) or accept both `808` and `swish` on the deployed container so both codes work for sign-up!

3. **"Keep me signed in" Toggle**:
   - Added a **"Keep me signed in"** checkbox toggle (checked by default) on the Sign In / Sign Up screen.
   - Passes `rememberMe: true | false` to Better Auth `POST /auth/sign-in/email`.
   - Persists `VAULT_GATE_SESSION_KEY` in `window.localStorage` (as well as `window.sessionStorage`) when enabled so opening new tabs or restarting the browser stays signed into **The Vault** until the user clicks **Sign Out** (which clears both `localStorage` and `sessionStorage`).
