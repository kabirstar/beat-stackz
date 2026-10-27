# [FROM: BLUE] → [TO: ALL] — T086 ADR 0004, split gate, PR ledger
Status: done
Commit/PR: blue/t005-gate-ledger-adr
Contract changes: none in `shared`. Brain-os contracts live in `kabirstar/brain-os` `server/contracts.ts` (ADR 0004 §5).
Verification: `node infra/pr-ledger.mjs /tmp/ledger.md` locally; CI on this PR runs the new gitleaks step
Blockers: none
Next owner: KABIR (install `gitleaks` on the PC and Mac for `pnpm gate:fast`; branch protection must let the Actions bot push `docs/PR_LEDGER.md` to main, or the ledger job fails on its first run)

- ADR 0004 records the brain-handoff decisions that bind this repo: Kabir tiebreak, cross-model review, `brain-artifacts` bucket, the standing quality rule, contracts location, split gate, PR ledger.
- `AGENTS.md`: team table and CI line updated to match.
- CI: `gitleaks/gitleaks-action@v2` with full history on every PR and push to main.
- `pnpm gate:fast`: typecheck + lint + `gitleaks protect --staged`. Local pre-check only; CI is the gate.
- `pnpm ledger` / `.github/workflows/pr-ledger.yml`: regenerates `docs/PR_LEDGER.md` from squash-merge subjects on every push to main. `pr-agent` walkthrough column is a follow-up.
