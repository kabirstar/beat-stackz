# [FROM: BLUE] → [TO: YELLOW, BRAIN, Kabir/Swish] — T043 review of Yellow's T026b + T028 (PR #45)
2026-10-23
Status: done (review posted; nothing merged)
Commit/PR: reviewed https://github.com/kabirstar/beat-stackz/pull/45 (`yellow/t026b-vault-gate`, 3db71f7). Blue opened the PR on Yellow's behalf so CI would run; CI is green.
Contract changes: none
Verification: on 3db71f7 after `pnpm -F @bpackz/shared build`: `pnpm -F web typecheck` clean, `pnpm -F web test` 9/9, `pnpm lint` clean, `pnpm -F web build` ok. `gh pr view 45 --json reviews` shows BLUE's review (id 5625696170).
Blockers: two must-fix items in the branch (below); T028 gate waits on Kabir/Swish.
Next owner: YELLOW (split + fixes), then Kabir/Swish (gate yes/no), then Blue merges.

## Verdict: request changes
Posted as a COMMENT review because GitHub refuses REQUEST_CHANGES on a PR you opened yourself. Treat it as blocking.

## T026b (contracted): correct
`resolveFolderUiMeta` keys by `folder.kind` first, name fallback when null. `sortVaultFolders` puts `DEFAULT_FOLDERS` first in canonical order, user folders after by name. Typechecks against the required `Folder.kind: FolderKind | null` from #42. Tested. Would merge today if it were alone.

## Why it cannot merge as-is
T026b and T028 are in one commit on one branch, and the branch carries two changes that must not reach app.beatstackz.com:

1. **Hardcoded auto-login.** `App.tsx` `bootstrapSession`: when `auth.me()` fails, the app signs in as `swish@bpackz.studio` / `password1234`. On the live site every logged-out visitor hits this, and if that account exists they land in Swish's vault with no login screen. Remove; the existing `setUser(null)` → AuthModal path is right.
2. **Client-side taxonomy seeding.** `App.tsx` `loadVaultContents` creates 19 folders when a vault has zero root folders. Red already seeds the 18 on the server (T026a, #38, transactional, backfilled). On the live API this only fires after a user trashes every root folder, and then recreates them with `kind: null` (API never accepts `kind`), so icons and order are lost. It also invents a "vision board" default that is not in ADR 0002. Delete the block.

## Asked of Yellow
- Split: `yellow/t026b` = `vaultTheme.ts` kind keying + `sortVaultFolders`, the `sortByOrder` swap in `App.tsx`, the `App.test.tsx` cases. Blue merges on green.
- Keep `yellow/t026b-vault-gate` for T028, rebased on top, with fixes 1 and 2 and the gate changes below. Holds for the decision.
- "vision board" as a default folder is a contract change: handoff to Blue → ADR 0002 + `shared` + Red's seeder. Until then it works from a user-created folder named "vision board" (the `viewingVisionBoard` name check already allows it). Mock taxonomy and `client.test.ts` revert to 18 folders.

## T028 gate: hold for Kabir/Swish
It is a cosmetic curtain, not access control: the passcode ships in the JS bundle and the unlock is a `sessionStorage` flag. Review asks: (a) never describe it as security in the UI ("SECURITY GATE MK-I", "ACCESS GRANTED") and say so in a code comment; (b) read the passcode from `VITE_VAULT_GATE_PASSCODE`, no gate when unset, so the hosted compose turns it on only if Kabir/Swish say yes. Merge of the gate waits for that yes in Discord.

## Nits (non-blocking, inline on the PR)
Fabricated `FileItem` for vision-board pins missing from the vault (default board pins mock ids that 404 on the live API); `sortVaultFolders` comparator inconsistent when only some folders have custom order; `VITE_MOCK=false` → localhost fallback is not what the hosted build uses; Yellow's handoff names the wrong branch; T028 ticked done in TASKS.md though undecided.
