import { z } from "zod";

export const Id = z.string().min(1).max(64);
export const Timestamp = z.string().datetime(); // ISO 8601, UTC
export const Name = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((s) => !s.includes("/"), "no slashes");

/** Default folder taxonomy (ADR 0002) = Yellow's icon set. Every new vault is seeded with this tree.
 *  `kind` is the slug path ("songs/mix"); it survives renames so the UI keeps the right icon.
 *  User-created folders have kind null. */
export const FolderKind = z.enum([
  "beats",
  "presets", "presets/plugin", "presets/vocals",
  "vocals", "vocals/main", "vocals/adlib", "vocals/bg",
  "songs", "songs/demo", "songs/mix", "songs/drop",
  "media", "media/photos", "media/videos", "media/mv", "media/bts", "media/covers",
]);
export type FolderKind = z.infer<typeof FolderKind>;
export type DefaultFolder = { kind: FolderKind; name: string; children: ReadonlyArray<{ kind: FolderKind; name: string }> };
export const DEFAULT_FOLDERS: ReadonlyArray<DefaultFolder> = [
  { kind: "beats", name: "beats", children: [] },
  { kind: "presets", name: "presets", children: [
    { kind: "presets/plugin", name: "plugin" }, { kind: "presets/vocals", name: "vocals" } ] },
  { kind: "vocals", name: "vocals", children: [
    { kind: "vocals/main", name: "main" }, { kind: "vocals/adlib", name: "adlib" }, { kind: "vocals/bg", name: "bg" } ] },
  { kind: "songs", name: "songs", children: [
    { kind: "songs/demo", name: "demo" }, { kind: "songs/mix", name: "mix" }, { kind: "songs/drop", name: "drop" } ] },
  { kind: "media", name: "media", children: [
    { kind: "media/photos", name: "photos" }, { kind: "media/videos", name: "videos" }, { kind: "media/mv", name: "music video" },
    { kind: "media/bts", name: "bts" }, { kind: "media/covers", name: "album covers" } ] },
];

export const VaultRole = z.enum(["owner", "editor", "viewer"]);
export const ShareRole = z.enum(["view", "edit"]);
export const VaultKind = z.enum(["personal", "shared"]);

export const ErrorCode = z.enum([
  "unauthorized", // 401 no session
  "forbidden", // 403 not a member / wrong role
  "not_found", // 404
  "conflict", // 409 name collision or stale ifUpdatedAt
  "invalid", // 400 zod failure
  "too_large", // 413
  "rate_limited", // 429
]);
export const ApiError = z.object({
  error: ErrorCode,
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const Page = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
