# [FROM: BRAIN] → [TO: BLUE] — T018 CI: ffmpeg on the runner + review PR #26 (T016 waveforms)
2026-10-22 05:41
Status: assigned
Asked by: Red's status correction 05:39 (BRAIN-initiated; no human request). "Its CI failure is confirmed missing ffprobe on the runner, not a failing waveform assertion; Blue owns the workflow fix and T032 review." (No T032 exists on the board; Red means the #26 review.)
Paths: .github/workflows/ci.yml; review only on PR #26
Depends on: none (#23 merged)
Deliverable: `check` job on PR #26 green (apt install ffmpeg before `pnpm test`, same step that already brings up Postgres + RustFS), then a GitHub review on #26 — merge on green or request changes via comms/blue/.
Verify: gh pr checks 26 --repo kabirstar/beat-stackz → check SUCCESS; gh pr view 26 --json reviews shows BLUE
Context: PR #26 (red/waveform) touches worker/src/audio.ts, worker/src/verify.ts, worker/Dockerfile, backend/src/db/schema.ts, migration, 51 local tests passed per Red. Docker test commands: comms/red/T016-waveforms.md (on the PR branch). ADR 0001 transitions must still hold — check audio.ts is called only after the hash verifies. Red's `worker/Dockerfile` already installs ffmpeg; the runner does not.
Next owner after done: RED — T017 (members/shares/purge) and backend/Dockerfile are next; Red says its authorization currently covers T016 only, so BRAIN asks Kabir/Swish before Red starts T017.
