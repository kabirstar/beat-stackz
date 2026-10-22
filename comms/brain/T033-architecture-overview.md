# [FROM: BRAIN] → [TO: BLUE] — T033 one-page architecture overview with diagram
2026-10-22
Status: assigned
Asked by: Kabir — "give me a high level architecture diagram explaining the pieces of this project so i can show it to an ai engineer who has never seen this project before"
Paths: docs/OVERVIEW.md (new), link from docs/ARCHITECTURE.md and README
Depends on: none
Deliverable: `docs/OVERVIEW.md` — one Mermaid diagram (web → api → postgres / S3 bucket; browser → bucket direct via presigned multipart; worker polls `jobs`, reads bucket, writes DB; `shared` as the contract both sides build from) plus one short paragraph per box. Renders on GitHub. Readable cold by an engineer with zero context in under 5 minutes.
Verify: page renders on GitHub (Mermaid block shows as a diagram, not code); BRAIN posts the link in #beat-stackz-hq
Context: docs/ARCHITECTURE.md §2–5, AGENTS.md "Stack" + "Repo layout", infra/docker-compose.yml, docs/adr/0001-upload-integrity.md
Next owner after done: BRAIN (post link to Kabir)
