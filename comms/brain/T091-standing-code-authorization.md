# [FROM: BRAIN] → [TO: BLUE] — T091 standing authorization for code changes (AGENTS.md rule)
2026-10-22
Status: assigned
Asked by: Swish, via #beat-stackz-hq 04:48
  > "can we have it always authorize code changes"
Decision (Swish has full authority, confirmed by Kabir 2026-10-22): code changes inside an agent's owned paths
and inside the fixed scope are pre-authorized. No agent waits on Kabir or Swish before starting, continuing or
merging a task on the board. The T015 hold ("Red's standing instruction from Kabir") is void from now on.
Still needs a human: scope (marketplace/payments/public catalog), design direction (look and feel sign-off,
e.g. PR #21's 3D objects), anything that costs money, vetoes.
Paths: AGENTS.md (Rules of engagement + Team row for humans), brain/README.md if it repeats the old wording,
.claude/agents/*.md only where they tell an agent to wait for a human
Depends on: none
Deliverable: one rule line in AGENTS.md saying the above (cite Swish 2026-10-22); strip any "wait for Kabir"
wording from the agent briefs; one line in COMMS_LOG.md to all. Smallest diff, no ADR.
Verify: `grep -n -i "authoriz" AGENTS.md` shows the new rule; Red and Yellow pinged
Context: comms/brain/T015-verification-worker.md (the hold history this replaces), AGENTS.md "Git flow"
(Blue-merges rule from Kabir 2026-10-21 — same spirit, extend it)
Next owner after done: none; RED proceeds on T015 without the #14-clearance gate once #14 is on main (it is)
