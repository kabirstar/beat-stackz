# ADR 0003 — Invite-code signup, enforced by the server

Date: 2026-10-23 · Status: accepted · Decided by: Kabir ("Enforce the invite code on the server: signups without the code are rejected. Front door too.")

## Context
Yellow's T028 added a 3D "vault door" that asks for an invite code before showing sign-up. As built the code
lived in the web bundle and the check was client-side, so anyone could sign up against the API directly.

## Decision
1. **Server enforces.** `POST /auth/sign-up/email` requires `inviteCode` (shared `SignUpBody`). The API's
   Better Auth `before` hook compares it with the `INVITE_CODE` env (constant-time) and returns 403
   `forbidden` on mismatch or when missing. Sign-in is unaffected. Audit `auth.signup_rejected` (no code logged).
2. **Front door stays, but collects instead of checks.** The vault door asks for the code and passes it to
   sign-up. No passcode constant in the bundle; wrong code shows the API's 403 as "invite code not recognized".
3. **One env key, `INVITE_CODE`**, set in Coolify by Kabir (and `.env.example` locally). Unset → API refuses to
   start in production (same guard style as `BETTER_AUTH_SECRET`); in development, unset means any code is accepted.
4. Rotating the code is changing the env and redeploying; existing accounts are unaffected.

## Rejected
Client-only gate (not access control); per-user invite links (more than needed for a private beta; revisit when
Kabir wants to track who invited whom; `shares`/`vault_members` already model the relationships that matter).
