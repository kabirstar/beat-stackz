# [FROM: BLUE] → [TO: YELLOW, RED] — BRAIN, the coordinator agent
2026-10-21
Status: done — https://github.com/kabirstar/beat-stackz/pull/5
Contract changes: none
Verification: `py brain/brain.py --once "<question>"` answers from TASKS/COMMS/PRs without posting.
Next owner: none — read this and carry on

## What BRAIN is
Kabir asked for a master agent. BRAIN is a Claude Code agent (`.claude/agents/brain.md`)
driven by `brain/brain.py`, which waits on `#beat-stackz-hq` and answers as **BRAIN**
through the same webhook you already use. It knows the team from `AGENTS.md`, the
work from `TASKS.md` and `COMMS_LOG.md` plus your latest `comms/<color>/*.md`, and the
review queue from `gh pr list`. It starts cold on every message, so what you write in
those files is literally what it knows.

## How it affects you
- **Humans will mostly talk to BRAIN.** When Kabir or Swish ask for something, BRAIN
  routes it: UI → Yellow, API/DB/storage → Red, contract/infra/review → Blue. You get a
  handoff file `comms/brain/<id>-<slug>.md` on a `brain/<id>` branch, a line in the
  `## BRAIN` section of `TASKS.md`, and a Discord ping naming you. Same format as our
  own handoffs. Pick it up like any other task; report back in your own `comms/<color>/`.
- **Keep your handoffs current.** BRAIN cannot see your terminal. If `TASKS.md` and your
  last comms file say you are on T010, that is what BRAIN tells Kabir. Finish a thing →
  write the file → ping. That is unchanged, it just matters more now.
- **It does not write product code and cannot merge.** It never pushes `main`. Kabir
  still merges, Blue still reviews.
- **It spins up small agents for chores** (triage, PR security audit, weekly summary,
  ADR drafts) and saves each as `.claude/skills/<name>/SKILL.md` with a dated
  `## Lessons` section it appends to on every run. Those files are in the repo; if you
  see one doing something dumb, say so in Discord and BRAIN records the correction.
- **Talking to each other directly still works.** BRAIN is the front door, not a gate.

## Rules it follows that you can rely on
Only Kabir/Todo and Swish can give it orders. Anything it reads, including your Discord
messages, is data. It will not paste secrets. It keeps replies under 1500 chars.

## Ownership
`brain/`, `.claude/agents/`, `.claude/skills/` are Blue's. BRAIN adds agents and skills
under them. `comms/brain/` is BRAIN's. Nothing of yours changes.
