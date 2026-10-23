# [FROM: BLUE] → [TO: YELLOW, RED, BRAIN] — T025 BRAIN auto-dispatches Red and Blue on the PC
2026-10-23
Status: done
Commit/PR: blue/t025-auto-dispatch → https://github.com/kabirstar/beat-stackz/pull/31
Contract changes: none
Verification: `py -m py_compile brain/brain.py`; `BRAIN_DRY_RUN=1 py brain/brain.py --dispatch` after un-seeing T035 → "would start BLUE on T035 in ../bpackz-blue"; worktree created; nothing spawned
Next owner: Kabir restarts `py brain/brain.py` on the PC so the new loop runs

## Decision (Kabir, 2026-10-23)
Yes: BRAIN's delegations to RED and BLUE start automatically and unattended on the PC. (Kabir first said no, then reversed; the yes stands.)

## What changed in `brain/brain.py` (Yellow's three items, plus guardrails)
1. `ensure_worktree()` takes a path and branch, resets with `checkout -f` and `clean -fd` (keeps `.env`, `.claude/`), so a stray file never wedges the loop.
2. `loop()` body is in try/except; a timeout or network blip logs and sleeps 30 s instead of exiting.
3. `dispatch()` runs after every wake. It does **not** parse BRAIN's chat text. It fetches origin, lists `brain/<id>` branches (the artifact `brain-delegate` always pushes), reads the handoff's first line, and for `[TO: RED]` / `[TO: BLUE]` starts `claude -p --permission-mode acceptEdits --allowedTools <pnpm git gh docker py node npx>` in `../bpackz-red` (`red-main`) or `../bpackz-blue` (`blue-main`), reset to origin/main first. The worker prompt tells it to read AGENTS.md and the handoff via `git show origin/brain/<id>:<path>`, work on `<owner>/<id>`, open a PR, write its handoff + COMMS_LOG line, ping Discord once, never push main, and decide rather than ask (nobody is watching).

Guardrails: one run per owner at a time, extra delegations queue in order; each id dispatched once (`.brain_dispatch.json`); first run only records existing ids so the 23 old branches never replay; 3-hour kill; logs in `brain/logs/<OWNER>-<id>.log` (gitignored). YELLOW stays ping-only (Mac).

## For each of you
- **BRAIN**: nothing changes in how you delegate. Keep the handoff header exact: `# [FROM: BRAIN] → [TO: RED] — T0xx title`. First owner in `[TO: ...]` is the one that runs.
- **RED**: your unattended runs happen in `../bpackz-red`, not `red-checkout/`. Both see the same origin; just pull. If a run gets stuck or does something odd, its log is `brain/logs/RED-<id>.log` in the main checkout.
- **YELLOW**: unchanged; you still get pings and start your own runs on the Mac.
- **Kabir**: restart `py brain/brain.py` to pick this up. Watching `brain/logs/` for the first few runs is worth it.
