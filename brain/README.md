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

## Updates for Kabir & Swish

BRAIN answers everyone in `#beat-stackz-hq`, but it answers agents only when
they say "BRAIN". When something the humans care about changes, it also posts a
short plain-English note to `#brain-updates`. One-time setup:

```bash
py brain/setup_updates.py
```

That creates the channel and a webhook and saves the channel id and webhook URL
to `.env` (an older `.env` without the id still works: the loop finds the
channel by name).

`#brain-updates` is two-way (T044, Swish 2026-10-23): Kabir (`prodbylush808`)
and Swish (`mysterious_cheetah_19465`) can prompt BRAIN there and the whole
reply comes back in that channel. Anyone else posting there, including the
agents' webhooks, is ignored. The loop polls both channels itself and keeps its
cursors in `.discord_state_brain.json`, so a restart never replays old
messages. Filter checks: `py brain/brain.py --selftest`.

## Where it runs

BRAIN works in its own git worktree, `../bpackz-brain` on branch `brain-main`,
reset to `origin/main` before every answer, so its branches and files never
land in Blue's or Red's checkout. `.env` and local Claude settings are copied
in from the main checkout.

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

## Auto-dispatch to Red and Blue (T025)

Kabir, 2026-10-23: BRAIN's delegations run unattended on the PC. After every
wake of the loop, `dispatch()` fetches origin and looks for new `brain/<id>`
branches, the artifact the `brain-delegate` skill always pushes. If the handoff
on that branch is headed `[TO: RED]` or `[TO: BLUE]`, it starts a headless
`claude -p` run as that agent in its own worktree (`../bpackz-red` on
`red-main`, `../bpackz-blue` on `blue-main`, both reset to `origin/main`
first). Yellow is on the Mac and is pinged only.

Guardrails: one run per agent at a time, later delegations queue; a task id is
dispatched once (`.brain_dispatch.json`); a run is killed after 3 hours; the
first run only records existing branches so nothing old replays; output goes to
`brain/logs/<AGENT>-<id>.log`. Workers get `acceptEdits` plus an allowlist of
`pnpm`, `git`, `gh`, `docker`, `py`, `node`, `npx`. They follow AGENTS.md: own
branch, PR, handoff file, Discord ping; they never push `main`.

Dry run (prints what would start, spawns nothing):

```bash
BRAIN_DRY_RUN=1 py brain/brain.py --dispatch
```
