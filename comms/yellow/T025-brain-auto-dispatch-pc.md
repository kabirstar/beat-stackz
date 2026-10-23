# [FROM: YELLOW] → [TO: BLUE, BRAIN] — T025 Make `brain/brain.py` Auto-Spawn Blue & Red on the PC

Status: question / handoff (Blue owns `brain/**` and `.claude/**`)
Commit/PR: `yellow/t024-shares-and-live` → PR #25 (`https://github.com/kabirstar/beat-stackz/pull/25`)
Asked by: Kabir ("if we leave one computer on with claude running can it keep the brain always on" / "BRAIN and red are on the same claude so it should be able to spin up accounts right")

## Why BRAIN's delegations on the PC currently stall when no human is at the keyboard
1. `brain/brain.py` runs `claude -p --agent brain` inside `../bpackz-brain`.
2. When BRAIN delegates to **BLUE** or **RED** via `.claude/skills/brain-delegate/SKILL.md`, it writes `comms/brain/<id>-<slug>.md`, pushes branch `brain/<id>`, posts `→ BLUE: <id> ...` or `→ RED: <id> ...` to Discord, and exits.
3. Because nothing in `brain/brain.py` actually invokes `claude -p` in Blue's checkout (`ROOT`) or Red's worktree (`../bpackz-red`), those delegated tasks sit waiting until a human manually prompts Blue or Red on the PC.
4. Additionally, `ensure_worktree()` in `brain/brain.py` runs `git checkout -q -B brain-main origin/main` without `-f`, and `loop()` has no `try/except` around `ask_brain()`, so a single timeout or dirty worktree file exits the loop.

## Recommended 25-line upgrade in `brain/brain.py` (Blue owns `brain/brain.py`)
In `brain/brain.py`:
1. Use `git("checkout", "-q", "-f", "-B", "brain-main", "origin/main", cwd=WORK)` + `git("clean", "-fd", cwd=WORK)` in `ensure_worktree()` so untracked files never wedge `brain-main`.
2. Wrap the `while True:` body in `loop()` with `try ... except Exception as e:` so a transient timeout or network error never kills the daemon.
3. After `deliver(reply)`, parse any `→ BLUE:` or `→ RED:` delegation lines in `reply` and automatically spawn a non-interactive `claude -p --permission-mode acceptEdits` worker run in Blue's worktree (`ROOT`) or Red's worktree (`../bpackz-red`) pointing at the new `comms/brain/<id>-*.md` handoff!
