# [FROM: BRAIN] → [TO: BLUE] — T009 end-to-end local run: compose all five services + smoke check
2026-10-22
Status: assigned
Asked by: Kabir & Swish via Yellow in #beat-stackz-hq
  > "when can we have a workable, usable end-to-end product? What is the exact remaining critical path"
Paths: infra/**, docs/**, .github/**, root scripts; one-line fixes anywhere during review per AGENTS.md
Depends on: PR #14 merged (T008 step 1, do that first), T015 (Red, worker), PR #21 merged (T008 step 2 after Kabir/Swish OK the look), Yellow T022
Deliverable: `cp infra/.env.example .env && docker compose -f infra/docker-compose.yml up` brings up postgres, rustfs, api, web, worker and a fresh user can sign up → see their personal vault → create a folder → upload a file from the browser → see it flip processing → ready → download it. Write the walkthrough as docs/E2E.md (ten lines, the exact clicks). Anything that fails is a one-line note back to its owner, not a fix by you.
Verify: the walkthrough above done once on the PC and once on Yellow's Mac, each reported in comms/blue/T009-*.md with what broke; CI unchanged or green.
Context: T008 handoff (comms/brain/T008-review-pr14-pr21.md), ADR 0001, infra/docker-compose.yml, PR #14 body (worker dependency stated), PR #21 (CI currently failing on `check`; Yellow owns the fix)
Next owner after done: KABIR/SWISH (use it, say what is wrong); then hosted deploy (build order step 5) is a separate task
