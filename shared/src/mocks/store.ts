import type { FileItem } from "../api/files.js";
import type { Folder } from "../api/folders.js";
import type { Share } from "../api/shares.js";
import type { User } from "../api/auth.js";
import { DEFAULT_FOLDERS, type FolderKind } from "../common.js";

export type VaultRow = { id: string; kind: "personal" | "shared"; name: string; createdAt: string };
export type MemberRow = { vaultId: string; userId: string; role: "owner" | "editor" | "viewer" };
export type ShareRow = Share & { token: string | null; revokedAt: string | null };
export type UploadRow = { uploadId: string; vaultId: string; key: string; size: number };

export interface Store {
  me: User;
  users: User[];
  vaults: VaultRow[];
  members: MemberRow[];
  folders: Folder[];
  files: FileItem[];
  shares: ShareRow[];
  uploads: UploadRow[];
  /** Soft-deleted rows live here, not in `folders`/`files`, so every live lookup stays unchanged. */
  trash: { folders: (Folder & { deletedAt: string })[]; files: (FileItem & { deletedAt: string })[] };
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}_${(++seq).toString(36).padStart(4, "0")}`;
export const now = () => new Date().toISOString();
const fakeSha = (s: string) => Array.from(s).map((c) => c.charCodeAt(0).toString(16)).join("").padEnd(64, "0").slice(0, 64);

export function seed(): Store {
  seq = 0;
  const t = now();
  const me: User = { id: "u_me", email: "artist@bpackz.test", name: "Test Artist", createdAt: t };
  const prod: User = { id: "u_prod", email: "producer@bpackz.test", name: "Test Producer", createdAt: t };

  const personal: VaultRow = { id: "v_personal", kind: "personal", name: "My vault", createdAt: t };
  const shared: VaultRow = { id: "v_shared", kind: "shared", name: "Artist x Producer", createdAt: t };

  const f = (id: string, vaultId: string, parentId: string | null, name: string, kind: FolderKind | null = null): Folder => ({
    id, vaultId, parentId, name, kind, createdBy: me.id, updatedAt: t,
  });
  // Both vaults carry the ADR 0002 default tree. Ids are fo_<p|s>_<kind with / as _>, e.g. fo_p_songs_mix.
  const kid = (prefix: string, kind: FolderKind) => `fo_${prefix}_${kind.replace("/", "_")}`;
  const defaults = (vaultId: string, prefix: string) =>
    DEFAULT_FOLDERS.flatMap((d) => [
      f(kid(prefix, d.kind), vaultId, null, d.name, d.kind),
      ...d.children.map((c) => f(kid(prefix, c.kind), vaultId, kid(prefix, d.kind), c.name, c.kind)),
    ]);
  const folders: Folder[] = [
    ...defaults(personal.id, "p"),
    ...defaults(shared.id, "s"),
    f("fo_proj", shared.id, null, "Track 01"),
    f("fo_proj_stems", shared.id, "fo_proj", "Stems"),
  ];

  const file = (id: string, vaultId: string, folderId: string | null, name: string, size: number, mime: string, dur: number | null): FileItem => ({
    id, vaultId, folderId, name, status: "ready", size, mime, sha256: fakeSha(id), durationMs: dur, hasWaveform: dur !== null,
    createdBy: me.id, createdAt: t, updatedAt: t,
  });
  const files: FileItem[] = [
    file("fi_kick", personal.id, "fo_p_beats", "kick.wav", 4_200_000, "audio/wav", 12_000),
    file("fi_vox", personal.id, "fo_p_vocals_main", "lead_vox.wav", 48_000_000, "audio/wav", 184_000),
    file("fi_master", personal.id, "fo_p_songs_drop", "track01_master_v3.wav", 52_000_000, "audio/wav", 190_500),
    file("fi_cover", personal.id, "fo_p_media_covers", "cover.png", 2_100_000, "image/png", null),
    file("fi_mix", shared.id, "fo_proj", "track01_mix_v2.wav", 51_000_000, "audio/wav", 190_200),
    file("fi_bass", shared.id, "fo_proj_stems", "bass.wav", 30_000_000, "audio/wav", 190_200),
  ];

  return {
    me,
    users: [me, prod],
    vaults: [personal, shared],
    members: [
      { vaultId: personal.id, userId: me.id, role: "owner" },
      { vaultId: shared.id, userId: me.id, role: "owner" },
      { vaultId: shared.id, userId: prod.id, role: "editor" },
    ],
    folders,
    files,
    shares: [],
    uploads: [],
    trash: { folders: [], files: [] },
  };
}
