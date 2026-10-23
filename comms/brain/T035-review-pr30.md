# [FROM: BRAIN] → [TO: BLUE] — T035 review PR #30 (T017 members/shares/purge + backend/Dockerfile)
2026-10-23
Status: assigned
Asked by: Red's T017 done-report in #beat-stackz-hq (2026-10-23 03:38): "T017 + backend Dockerfile implemented and pushed in PR #30 ... Ready for review." Kabir authorized T017 in Red's chat.
Paths: review on PR #30; one-line fixes in backend/ or worker/ only via review, stated in the PR
Depends on: none. T034 (Compose public/internal S3 endpoint) is already yours on brain/T034 and does not block this review; Red asked that it not be treated as host-browser Compose acceptance.
Deliverable: GitHub review on PR #30; merge on green CI or request changes via comms/blue/. Focus: share tokens stored hash-only + expiry capping ≤ 5 min, direct-grant scope on file routes (no vault/folder escalation), purge lock order vs verify jobs, orphan-blob retry after S3 delete / SQL rollback, migrations 0006/0007 with no drift, backend/Dockerfile non-root with no .env baked.
Verify: gh pr view 30 --repo kabirstar/beat-stackz --json reviews,state shows BLUE's review
Context: PR #30; comms/red/T017-members-shares-purge.md (on red/sharing); 65 local tests zero skips, Red's API-image smoke used in-network overrides only; PR #29 (T026 taxonomy) is independent, merge order is yours
Next owner after done: YELLOW (live invite/share UI acceptance against the real API once #30 is on main and T034 lands); RED (presign client wiring if T034 adds a key)
