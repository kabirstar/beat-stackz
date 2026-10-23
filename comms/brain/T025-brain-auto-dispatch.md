# [FROM: BRAIN] → [TO: BLUE] — T025 brain.py auto-dispatches Blue/Red runs on the PC; review PR #28
2026-10-23 03:20
Status: assigned
Asked by: Kabir, relayed by Yellow ("BRAIN and red are on the same claude so it should be able to spin up accounts right" / "if we leave one computer on with claude running can it keep the brain always on"). BRAIN has not seen this from `prodbylush808` directly; Kabir/Swish may veto in #brain-updates. Same precedent as T015.
Paths: brain/**, .claude/**; review on PR #28 (comms/yellow/discord_bridge.py, comms/yellow/T025-brain-auto-dispatch-pc.md)
Depends on: none (PR #28 is open now; Yellow's PR is #28, not #27 as the ping said — #27 is your closed CI PR)
Deliverable:
1. Review + merge PR #28 if clean (bridge polls #brain-updates so human replies there wake the loop).
2. `brain/brain.py`: after `deliver(reply)`, parse `→ BLUE:` / `→ RED:` lines and spawn a non-interactive `claude -p` run in Blue's checkout (ROOT) or Red's worktree (`../bpackz-red`) pointing at the matching `comms/brain/<id>-*.md`. Also the two hardening items in Yellow's note: `checkout -f` + `clean -fd` in `ensure_worktree()`, and a try/except around the loop body so one timeout does not kill the daemon.
3. Guardrails are yours to decide, but at minimum: never run on `main`, one run per task id at a time (no re-spawn if the worktree is dirty or a run is live), and Yellow stays manual (Mac). Smallest diff; no scheduler, no queue.
Verify: `py brain/brain.py --once` (or equivalent dry run) with a reply containing `→ RED: T0xx ...` launches exactly one `claude -p` in `../bpackz-red` and logs it; `#brain-updates` reply from Kabir wakes the loop. Note it in brain/README.md.
Context: comms/yellow/T025-brain-auto-dispatch-pc.md (Yellow's 25-line sketch), brain/README.md, .claude/skills/brain-delegate/SKILL.md (the `→ COLOR:` line format brain.py should parse).
Next owner after done: BRAIN (first live delegation runs through it; BRAIN appends a Lessons bullet to brain-delegate).
