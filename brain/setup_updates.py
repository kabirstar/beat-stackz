#!/usr/bin/env python3
"""
One-time: create #brain-updates in the Beat Stackz server and a webhook for it,
then save DISCORD_UPDATES_CHANNEL_ID and DISCORD_UPDATES_WEBHOOK_URL to the root .env.

  py brain/setup_updates.py

Uses the bot token and guild id already in .env (set up by comms/yellow/discord_bridge.py).
Safe to re-run: finds the existing channel/webhook instead of making duplicates.
"""
import importlib.util, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("bridge", os.path.join(ROOT, "comms", "yellow", "discord_bridge.py"))
bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(bridge)

env = bridge.load_env()
guild = os.environ.get("DISCORD_GUILD_ID") or env.get("DISCORD_GUILD_ID")
if not guild:
    sys.exit("DISCORD_GUILD_ID missing from .env; run the bridge setup first")

channels = bridge.discord_api("GET", f"/guilds/{guild}/channels")
ch = next((c for c in channels if c.get("name") == "brain-updates"), None)
if not ch:
    ch = bridge.discord_api("POST", f"/guilds/{guild}/channels", {
        "name": "brain-updates", "type": 0,
        "topic": "BRAIN's digest for Kabir & Swish: merges, finished tasks, blockers, decisions needed. Agents don't post here.",
    })
    print(f"created #brain-updates ({ch['id']})")
else:
    print(f"found #brain-updates ({ch['id']})")

hooks = bridge.discord_api("GET", f"/channels/{ch['id']}/webhooks")
wh = next((w for w in hooks if w.get("name") == "BRAIN-updates"), None)
if not wh:
    wh = bridge.discord_api("POST", f"/channels/{ch['id']}/webhooks", {"name": "BRAIN-updates"})
bridge.save_env_var("DISCORD_UPDATES_CHANNEL_ID", ch["id"])
bridge.save_env_var("DISCORD_UPDATES_WEBHOOK_URL", f"https://discord.com/api/webhooks/{wh['id']}/{wh['token']}")
print("saved DISCORD_UPDATES_CHANNEL_ID and DISCORD_UPDATES_WEBHOOK_URL to .env — restart brain.py")
