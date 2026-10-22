# [FROM: BRAIN] → [TO: BLUE] — T032 review PR #26 (Red T016 waveforms) + run worker tests in CI via the Docker test target
2026-10-22
Status: assigned
Asked by: Red, via #beat-stackz-hq (PR review and `.github/**` are Blue's per AGENTS.md; T016 itself was authorized on brain/T016, conditional on #23, which you merged)
  > "T016 is implemented and pushed in PR #26 ... 51 local tests passed, zero skips ... CI needs your owned workflow update to run worker tests in its Docker test target (host has no native tools): exact commands in comms/red/T016-waveforms.md. Please review #26 and wire CI."
Paths: .github/workflows/ci.yml; review-only on PR #26; one-line fixes anywhere per AGENTS.md, say so in the PR
Depends on: none (#23 merged). #25 (T031) is independent; merge order does not matter.
Deliverable:
  1. `ci.yml`: host `pnpm test` excludes `worker`; worker suite runs from `docker build -f worker/Dockerfile --target test` with `--network host` and the existing service env (Red's exact commands are in comms/red/T016-waveforms.md on the PR branch). Land it so #26 can go green: either as a one-line fix on #26 or a tiny blue/ PR merged first, your call. CI check on #26 was IN_PROGRESS at 05:18 on the old workflow; expect it to fail on the worker tests until this lands.
  2. GitHub review on #26; merge on green (squash, delete branch). Focus, not a full re-read:
     - worker/src/audio.ts + verify.ts: no original bytes on disk, one S3 GET, metadata committed only after hash/size match (ADR 0001); audio failure leaves the file ready and downloadable, retry capped; nested ffmpeg protocols disabled.
     - backend/src/db/schema.ts (+2 lines, "no migration"): confirm drizzle-kit check agrees — Red says db:generate reported no changes.
     - waveform response matches shared files.waveform schema exactly (8-bit peaks, 256 samples/px, v2); 409 until ready, 404 non-audio.
     - worker/Dockerfile: audiowaveform 1.10.2 .deb per TARGETARCH + Debian ffmpeg; `test` target does not leak into the prod stage.
     - TASKS.md diff touches only the RED section.
Verify: `gh pr view 26 --repo kabirstar/beat-stackz --json reviews,state,statusCheckRollup` shows BLUE's review and a green `check` that ran the worker suite; comms/blue/T032-*.md or a COMMS_LOG line
Context: comms/red/T016-waveforms.md (PR branch), worker/README.md (limits + run commands), docs/adr/0001-*.md, comms/brain/T016-waveform-json.md (brain/T016)
Next owner after done: YELLOW (render the real waveform peaks in the player — currently mocks), RED (T017 members/shares/purge, which the merged UI already calls; Red is waiting on Kabir's explicit go per its standing rule — see T091)
