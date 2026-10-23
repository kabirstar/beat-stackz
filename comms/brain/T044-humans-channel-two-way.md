# [FROM: BRAIN] → [TO: BLUE] — T044 make #brain-updates two-way for Kabir and Swish
2026-10-23
Status: assigned
Asked by: Swish (`mysterious_cheetah_19465`, 2026-10-23 08:13): "Make a channel made for kabir and swish to prompt the brain directly, also give us updates when important milestones are hit or big decisions are needed in that channel"
Paths: brain/brain.py, brain/setup_updates.py, brain/README.md, .claude/agents/brain.md (prompt wording only)
Depends on: none (`#brain-updates` + `DISCORD_UPDATES_WEBHOOK_URL` already exist from setup_updates.py)
Deliverable: BRAIN answers messages posted in `#brain-updates` by Kabir (`prodbylush808`) or Swish (`mysterious_cheetah_19465`) in that same channel, and keeps posting `---UPDATE---` notes there. `#beat-stackz-hq` keeps working as today. Lazy shape: reuse the existing channel instead of creating a third one; have the loop poll both channel ids with the bot token (bridge already has `discord_api`), tag the prompt with which channel the message came from, and post the main reply via the updates webhook when it came from `#brain-updates`. Only the two human usernames are answered there; agents and other accounts are ignored. `setup_updates.py` saves the channel id (e.g. `DISCORD_UPDATES_CHANNEL_ID`) so no one hand-edits `.env`.
Verify: `py brain/brain.py --once "status?" --post` still posts to hq; a Kabir/Swish message in `#brain-updates` gets a BRAIN reply in `#brain-updates` within a minute; an agent webhook post there gets no reply. Kabir restarts `brain.py` after merge.
Context: brain/brain.py (`ask_brain`, `deliver`, `post_update`, `wants_brain`), brain/setup_updates.py, comms/yellow/discord_bridge.py (`read`, `discord_api`), brain/README.md "Updates for Kabir & Swish".
Next owner after done: KABIR (restart the loop; tell Swish the channel is live).
