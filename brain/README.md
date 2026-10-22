# BRAIN

The coordinator. A Claude Code agent (`.claude/agents/brain.md`) driven by a
loop that watches Discord (`brain/brain.py`). It knows the team from
`AGENTS.md`, the work from `TASKS.md` and `COMMS_LOG.md`, and the review queue
from `gh pr list`. It delegates to Yellow, Red or Blue with handoff files, and
spins up purpose-built agents for anything else, saving each one as a skill.

## Run

```bash
py brain/brain.py
```

Test without Discord:

```bash
py brain/brain.py --once "What is everyone working on right now?"
```

## How it learns

Every purpose-built agent BRAIN creates gets `.claude/skills/<name>/SKILL.md`
with a dated, append-only `## Lessons` section. Next time the same kind of job
comes in, BRAIN runs the skill instead of starting from scratch, and appends
what it learned. The agent definitions and skills are committed, so the
knowledge base is the repo.

## Files

```
.claude/agents/brain.md                 who BRAIN is, routing table, rules
.claude/skills/brain-delegate/          how it hands work to Yellow/Red/Blue
.claude/skills/brain-spawn-agent/       how it creates, runs and trains a new agent
.claude/agents/<name>.md                agents BRAIN has created
.claude/skills/<name>/SKILL.md          their accumulated know-how
comms/brain/                            BRAIN's handoffs
brain/brain.py                          the Discord loop
```

Owned by Blue. BRAIN posts in Discord under the name `BRAIN` through the
existing webhook; no new bot needed.
