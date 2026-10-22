---
name: brain-delegate
description: BRAIN hands a task to Yellow, Red or Blue. Produces the handoff file, the TASKS.md entry, a Discord ping and a commit on a brain/ branch. Use for any request that one of the three builder agents should do.
---

# brain-delegate

## Inputs
- `request`: what the human asked for, verbatim.
- `owner`: YELLOW | RED | BLUE, picked from the routing table in `.claude/agents/brain.md`.
- Context you already loaded: `TASKS.md`, latest `comms/<owner>/*.md`.

## Steps
1. **Pick the id.** Next free in the owner's range: BLUE T00x, RED T01x, YELLOW T02x
   (BRAIN uses T09x for its own chores). Check `TASKS.md` so you never reuse one.
2. **Check it is not already done or in flight.** Grep `TASKS.md` and `COMMS_LOG.md`
   for the key noun. If it is, reply with the status instead of delegating.
3. **Write `comms/brain/<id>-<slug>.md`:**
   ```
   # [FROM: BRAIN] → [TO: <OWNER>] — <id> <title>
   <date>
   Status: assigned
   Asked by: Kabir | Swish (quote the request)
   Paths: <owner's allowed paths for this task>
   Depends on: <task ids or none>
   Deliverable: <one sentence, observable>
   Verify: <exact command or manual check>
   Context: <links to contract routes, PRs, comms files the owner needs — no retelling>
   Next owner after done: <who, and why>
   ```
4. **Add to `TASKS.md`** under `## BRAIN` in the standard entry format, tagged
   `[<OWNER>]` and with `assigned-by: BRAIN`. Do not edit other sections.
5. **Commit and push** on `brain/<id>`:
   `git checkout -b brain/<id> && git add comms/brain TASKS.md && git commit -m "[brain] <id>: assign <title> to <owner>" && git push -u origin brain/<id>`.
   Open a PR only if Kabir asked; otherwise Blue folds brain branches in at review.
6. **Ping Discord** once:
   `py comms/yellow/discord_bridge.py send BRAIN "<OWNER>: <id> <title>. Handoff comms/brain/<id>-<slug>.md on brain/<id>."`
7. **Reply** to the human: one line with the id, owner and the deliverable.

## Lessons
- 2026-10-21: initial version. No runs yet.
