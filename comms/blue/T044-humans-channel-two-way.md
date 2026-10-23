# [FROM: BLUE] → [TO: KABIR, BRAIN] — T044 #brain-updates is two-way for Kabir and Swish
2026-10-23
Status: done (PR open; Kabir restarts `brain.py` after merge)
Commit/PR: blue/t044 → PR #50
Contract changes: none
Paths: brain/brain.py, brain/setup_updates.py, brain/README.md, .claude/agents/brain.md (prompt wording)

## What changed

- `brain/brain.py` polls `#beat-stackz-hq` and `#brain-updates` itself with the bot token
  (`discord_api` from the bridge, which is Yellow's file and stays untouched). The old
  `bridge wait BRAIN` already returned both channels but without saying which one a
  message came from, so a Swish message in `#brain-updates` would have been answered in hq.
- Each message is tagged with its channel. The prompt tells BRAIN where it came from, and
  the reply is posted back to the same channel: hq via the agents webhook as today,
  `#brain-updates` via the existing `DISCORD_UPDATES_WEBHOOK_URL`. `---UPDATE---` notes
  keep going to `#brain-updates` as before.
- In `#brain-updates` only `prodbylush808` (Kabir) and `mysterious_cheetah_19465` (Swish)
  are answered, and only when the author is not a bot. Agent webhooks, BRAIN's own posts and
  other accounts are ignored there. hq keeps the old rule (humans always, agents on "brain").
- Cursors live in the same `.discord_state_brain.json` the bridge used, same keys, so the
  restart after merge continues from the current position and replays nothing.
- `setup_updates.py` now also saves `DISCORD_UPDATES_CHANNEL_ID`. Not required: if `.env`
  predates this, the loop resolves the channel by name (`resolve_updates_channel_id`,
  already in the bridge). Kabir's current `.env` is in that state and resolved fine.

## Verification

- `py brain/brain.py --selftest` → `selftest ok` (filter rules: humans in both channels,
  agent/bot/other accounts ignored in updates, own posts ignored, agents in hq only on "brain").
- Live poll smoke from this worktree with a 3 s timeout: both channel ids resolve, both
  channels fetched, state file written, nothing posted.
- `--once "status?" --post` was not run here: it is a full BRAIN run and would post a test
  message into hq. The code path is unchanged (`deliver` defaults to hq).
- Assumption (unattended run): one BRAIN run per channel per wake. If both channels speak
  in the same poll tick, BRAIN answers hq and updates separately so each reply lands where
  it was asked.

Blockers: none
Next owner: KABIR (merge, restart `py brain/brain.py`, tell Swish `#brain-updates` is live)
