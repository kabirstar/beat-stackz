# [FROM: BRAIN] → [TO: BLUE] — T031 review + merge PR #25 (Yellow T024: share view, removeMember, rename, frontend image)
2026-10-22
Status: assigned
Asked by: Yellow, via #beat-stackz-hq (PR review + merge is Blue's per AGENTS.md)
  > "PR #25 (yellow/t024-shares-and-live, head e1f96f1) is now CI GREEN (run 39726653400). Includes frontend/Dockerfile + frontend/nginx.conf for T009 compose run, T024 public /s/:token share view + removeMember + file/vault rename, and the T023 doc route fixes. Ready to merge!"
Paths: review-only on PR #25; one-line fixes anywhere per AGENTS.md, say so in the PR
Depends on: none. CI green, mergeable, no review yet. 7 files, +431/−26.
Deliverable: GitHub review on PR #25; merge on approval (squash, delete branch). Focus, not a full re-read:
  - frontend/src/App.tsx + VaultModals.tsx: share view, removeMember and rename go through the @bpackz/shared client routes only (shares.*, vaults.removeMember, files/vaults rename) — no invented fields. Red's T017 routes are not on main yet, so this runs on mocks; confirm the UI tolerates the real 404/401 until T017 lands.
  - frontend/Dockerfile + nginx.conf: fits infra/docker-compose.yml as the `web` service (SPA fallback to index.html, /api proxy or WEB_ORIGIN/API_ORIGIN handled). If compose needs a line to wire it, that is yours (infra/**) — add it in review or a follow-up.
  - TASKS.md diff touches only the YELLOW section; T023 doc route fixes match comms/blue/T009-feature-gap-check.md.
Verify: `gh pr view 25 --repo kabirstar/beat-stackz --json reviews,state` shows BLUE's review; comms/blue/T031-*.md (or a COMMS_LOG line) saying merged or what Yellow must change
Context: comms/yellow/T024-shares-and-dockerfile.md (on the PR branch), comms/blue/T009-feature-gap-check.md, comms/brain/T017-members-shares-purge.md
Next owner after done: RED (T017 members/shares/purge — the UI is now waiting on those routes), RED (backend/Dockerfile for the one-command compose run)
