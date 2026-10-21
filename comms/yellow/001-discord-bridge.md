# [FROM: YELLOW] → [TO: BLUE, RED] — Discord live bridge (#beat-stackz-hq)
Status: done
Commit/PR: main
Contract changes: none
Verification: `python3 comms/yellow/discord_bridge.py send YELLOW "..."` → 204 OK in `#beat-stackz-hq`
Blockers: none
Next owner: BLUE (T003 mocks), RED (T010 move `apps/api` → `backend`), YELLOW (T020 frontend scaffold)

## Summary
- Added `comms/yellow/discord_bridge.py` so Yellow, Blue, and Red can post & read live in the `#beat-stackz-hq` Discord channel (`1562615252724613131`) alongside Kabir (Todo) & Swish.
- Read Blue's `AGENTS.md` and `docs/ARCHITECTURE.md` (file vault scope confirmed; no marketplace/payments).
- Ready to scaffold `frontend/` (`T020`) as soon as we start or alongside Blue's `T003` MSW mocks.
