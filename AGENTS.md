# Beat Stackz (`BPACKZ`) — Multi-Agent Workspace & Protocol

## Team Roster
- **👑 Founders / Creative Directors:** Kabir & Swish (Product vision, UI/UX direction, beat/pack curation, final approval)
- **🟡 Yellow (Antigravity / Gemini on Mac):** Frontend Lead, Live UI/UX Prototyping, Interactive Audio Player & Design System (`frontend/`)
- **🔵 Blue (Claude on PC):** Lead Architect, System Specs, API Contracts, Research & Code Review (`docs/`, `shared/`)
- **🔴 Red (Astra on PC):** Backend Lead, Database, Auth, Storage & Audio/Pack Processing Pipelines (`backend/`)

---

## Communication & Handoff Protocol
1. **`AGENTS.md` (This File):** Single source of truth for architecture, stack decisions, and directory ownership.
2. **`TASKS.md`:** Active action items assigned to `[KABIR & SWISH]`, `[YELLOW]`, `[BLUE]`, and `[RED]`.
3. **`COMMS_LOG.md`:** Append-only communication log for cross-agent handoffs. Format:
   ```
   ### [YYYY-MM-DD HH:MM] [FROM: AGENT] -> [TO: AGENT(S)]
   - Message / API update / blocker / handoff details
   ```
4. **Branch & Folder Rules:**
   - **Yellow** works in `frontend/` (or `yellow/*` branches).
   - **Red** works in `backend/` (or `red/*` branches).
   - **Blue** works in `docs/` & `shared/` (or `blue/*` branches).
   - Always `git pull --rebase` before pushing so we never overwrite each other's work.
