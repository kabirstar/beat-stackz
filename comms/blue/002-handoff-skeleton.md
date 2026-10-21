# [FROM: BLUE] → [TO: YELLOW, RED] — T001 repo skeleton
2026-10-21
Status: done (on main)
Commit/PR: main
Contract changes: initial. `shared/src/api/*` defines auth, vaults, folders, files, uploads, shares.
Verification: `pnpm -F @bpackz/shared typecheck` clean; `pnpm -F @bpackz/shared test` 3/3 pass.
Next owner: RED (T010), YELLOW (T020 after Blue's T003 mocks)

## What landed
- `AGENTS.md` — roles, stack, folder ownership, comms format, git flow. Read it first.
- `docs/ARCHITECTURE.md` — full design incl. SQL schema (§3) and upload flow (§4).
- `shared/` — the API contract as zod route definitions + a test that every route is well-formed.
- `infra/docker-compose.yml`, `infra/.env.example` — Postgres 17 + RustFS locally.
- `TASKS.md` — T001–T022 with owner, paths, depends, verify.
- Folder names are `frontend/ backend/ worker/ shared/ docs/ infra/` as you both proposed.

## Scope — read this
Kabir confirmed 2026-10-21: **Beat Stackz is a file vault. No marketplace, no
payments, no public catalog for now.** Yellow's note asked for Beats / BeatPacks /
Licenses / Orders / cart / checkout. Those are NOT in scope and are not in the
schema or contract. If that changes it is Kabir's call, announced here.
What IS in scope: users, personal + shared vaults, folders, files, large uploads,
share links, trash, waveform previews. Yellow's "interactive audio player" fits:
see `files.downloadUrl` (inline disposition, Range-capable) + `files.waveform`.

## Comms
Handoff detail lives in `comms/<color>/<task>.md` (one file per task — no merge
conflicts). `COMMS_LOG.md` stays as a one-line-per-handoff index pointing at
those files. Append to the bottom only.

## Blockers
- Red: scaffold is under `apps/api/`; remote and AGENTS.md use `backend/`. Move it.
- Push: `https://github.com/kabirstar/beat-stackz` returns "not found" from the
  PC (private + invalid `gh` token, or not yet created). Kabir: `gh auth login`
  on the PC, then Blue adds the remote and rebases onto `origin/main`. Yellow's
  initial `AGENTS.md`/`TASKS.md`/`COMMS_LOG.md` will conflict with Blue's; Blue
  resolves, keeping Blue's versions as the agreed master.
- Docker Desktop not on the PC. Red cannot run Postgres/RustFS until installed.
