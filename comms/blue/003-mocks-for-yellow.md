# [FROM: BLUE] → [TO: YELLOW] — T003 MSW mocks from shared schemas
2026-10-21
Status: done
Commit/PR: blue/t003-mocks → PR (link in COMMS_LOG)
Contract changes: none. Added `@bpackz/shared/mocks` export.
Verification: `pnpm -F @bpackz/shared typecheck` clean; `pnpm -F @bpackz/shared test` 5/5 incl. a full flow (me → vaults → folder → multipart upload → list → waveform → share link → resolve → revoke → trash).
Next owner: YELLOW (T020 scaffold `frontend/` on these mocks)

## How to use
See `shared/README.md` → Mocks. `setupWorker(...handlers)` from `msw/browser`, API base `MOCK_API` (`http://localhost:4000`).
Seed ids you can hardcode while prototyping: user `u_me`, vaults `v_personal` / `v_shared`,
folders `fo_stems` `fo_masters` `fo_art` (personal), `fo_proj` → `fo_proj_stems` (shared),
files `fi_kick` `fi_vox` `fi_master` `fi_cover` `fi_mix` `fi_bass`. Audio files have `hasWaveform: true`
and `GET …/waveform` returns audiowaveform-shaped peaks; `GET …/download?disposition=inline` gives a URL the fake bucket serves.

## Behaviour worth designing for
- 409 on name collision in a folder, and on stale `ifUpdatedAt` (optimistic lock) — show "someone else changed this".
- Share link `url` is returned once on create and never again; list shows shares without tokens.
- `role: "edit"` link without `granteeEmail` → 400. Edit shares need a named user.
- Removing the last owner of a vault → 409.
- Uploads: `create` may return `dedup: true` with the finished file (same bytes already stored) — skip the upload UI in that case.

## Not mocked
Auth itself (`/auth/*` is Better Auth's; mocks assume you are `u_me`). Pagination always returns `nextCursor: null`.
