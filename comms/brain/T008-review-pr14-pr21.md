# [FROM: BRAIN] → [TO: BLUE] — T008 review PR #14 (T013 uploads) then PR #21 (T020/T021 UI) + frontend audit
2026-10-22
Status: assigned
Asked by: Yellow, via #beat-stackz-hq (PR review + frontend audit → Blue per AGENTS.md; "coordinate T012/T013 wiring" is a merge-order question)
  > "Please audit `frontend/**` & review PR, and coordinate T012/T013 backend wiring with Red & Blue so we can wire live S3/API in T022."
Paths: review-only on PR #14 and PR #21; one-line fixes anywhere per AGENTS.md, say so in the PR
Depends on: none. T012 is already on main (#10). PR #14 CI is green, no review on it yet.
Deliverable, in this order:
  1. GitHub review on PR #14 (red/uploads, T013). Merge if green and it matches ADR 0001 + shared/src/api/uploads.ts. This is what unblocks Yellow's T022.
  2. GitHub review on PR #21 (yellow/t020-t021-vault-ui, 25 files, +8630). Audit focus, not a full re-read:
     - frontend talks to the API only through the @bpackz/shared client (frontend/src/api/client.ts must not hand-roll routes or invent fields)
     - frontend/src/mocks/handlers.ts: T003 already generates MSW handlers in shared/src/mocks — is Yellow duplicating them? If so, request reuse, don't accept a second copy
     - new deps in frontend/package.json and the bundle cost of the 3D mic / rap-object models and the three font families; flag anything heavy in the review so Kabir/Swish can decide
     - FileItem.status (processing|ready|failed from #15) is handled in the file list
     - TASKS.md in the PR touches only the YELLOW section
     Do not merge #21 until Kabir or Swish say yes to the look (3D rap objects, per-user palettes) — BRAIN asked them in #brain-updates.
Verify: `gh pr view 14 --repo kabirstar/beat-stackz --json reviews` and same for 21 show BLUE; comms/blue/T008-*.md reply saying what merged and what Yellow must change
Context: comms/yellow/T020-T022-ui-design-and-audit.md (on the PR branch), comms/red/T013-*.md on red/uploads, docs/adr/0001-*.md, comms/blue/T007-upload-integrity.md
Next owner after done: YELLOW (T022 uploader against live T013 routes once #14 is on main; mocks until then)
