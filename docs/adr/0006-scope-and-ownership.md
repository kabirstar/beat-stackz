# ADR 0006 — Scope lives in docs/SCOPE.md; Kabir is the single owner

Date: 2026-11-05 · Status: accepted · Decided by: Kabir

## Context
Development stalled because scope was being worked out as it went. The 2026-10-21 lock ("file vault only") had been
overtaken by features nobody had agreed in one place (vision board, video tools, a wanted store). Separately, ADR
0004 decision 1 gave Kabir and Swish equal authority with co-sign on some paths; Swish has a job and his own music,
and Kabir does not want work to wait on him.

## Decisions
1. **`docs/SCOPE.md` is the source of truth** for what is built and in what order. It replaces the "file vault
   only" scope lock in `AGENTS.md`. Agents build the current milestone only and propose anything else first.
2. **Still not built:** payments, store, public catalog, distribution, social. They are long-term vision. Design so
   they can be added (usernames, public profiles); do not build toward them otherwise.
3. **Kabir owns the product and decides.** Swish helps and may do everything Kabir can except: change the scope,
   spend money, touch hosting or secrets, open sign-up, delete accounts, vaults or data for real, or reverse a
   recorded decision. Swish's review is never a blocking step, except sign-off on big changes to the look.
4. **This supersedes ADR 0004 decision 1** (equal authority, co-sign, 30-minute timeout). The rest of ADR 0004
   stands.
5. **Cadence:** scope is revisited every two weeks; Kabir signs off each milestone.

## Rejected
A Swish sign-off round on the scope (would make him a dependency); keeping "file vault only" and treating the board
and video tools as exceptions (the exceptions had become the rule).
