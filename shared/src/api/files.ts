import { z } from "zod";
import { Id, Name, Page, Timestamp } from "../common.js";
import { Folder } from "./folders.js";
import { route } from "../route.js";

/** processing = uploaded, worker has not verified the bytes yet; failed = hash mismatch, re-upload. See ADR 0001. */
export const FileStatus = z.enum(["processing", "ready", "failed"]);

export const FileItem = z.object({
  id: Id,
  vaultId: Id,
  folderId: Id.nullable(),
  name: Name,
  status: FileStatus,
  size: z.number().int().nonnegative(),
  mime: z.string().nullable(),
  sha256: z.string().length(64).nullable(), // server-verified; null until status is ready
  durationMs: z.number().int().nullable(),
  hasWaveform: z.boolean(),
  createdBy: Id.nullable(),
  createdAt: Timestamp,
  updatedAt: Timestamp,
});
export type FileItem = z.infer<typeof FileItem>;

const VaultParams = z.object({ vaultId: Id });
const FileParams = VaultParams.extend({ fileId: Id });
const TokenQuery = z.object({ token: z.string().optional() });

export const fileRoutes = {
  /** Children of a folder (vault root when folderId omitted). Folders are not paged; files are. */
  listChildren: route({
    method: "GET",
    path: "/vaults/:vaultId/children",
    auth: "session",
    params: VaultParams,
    query: Page.extend({ folderId: Id.optional() }),
    response: z.object({
      folders: z.array(Folder),
      files: z.array(FileItem),
      nextCursor: z.string().nullable(),
    }),
    summary: "List folder contents",
  }),
  get: route({
    method: "GET",
    path: "/vaults/:vaultId/files/:fileId",
    auth: "session",
    params: FileParams,
    response: FileItem,
    summary: "File metadata",
  }),
  update: route({
    method: "PATCH",
    path: "/vaults/:vaultId/files/:fileId",
    auth: "session",
    params: FileParams,
    body: z.object({
      name: Name.optional(),
      folderId: Id.nullable().optional(), // move within vault
      toVaultId: Id.optional(), // move across vaults; caller must be editor in both
      ifUpdatedAt: Timestamp,
    }),
    response: FileItem,
    summary: "Rename / move. 409 on collision or stale.",
  }),
  trash: route({
    method: "DELETE",
    path: "/vaults/:vaultId/files/:fileId",
    auth: "session",
    status: 204,
    params: FileParams,
    response: z.object({}),
    summary: "Soft-delete",
  }),
  /** Short-lived presigned GET. Range requests work directly against the URL. */
  downloadUrl: route({
    method: "GET",
    path: "/vaults/:vaultId/files/:fileId/download",
    auth: "share-token",
    params: FileParams,
    query: TokenQuery.extend({ disposition: z.enum(["inline", "attachment"]).default("attachment") }),
    response: z.object({ url: z.string().url(), expiresAt: Timestamp }),
    summary: "Presigned GET URL, 5 min. 409 conflict until status is ready.",
  }),
  waveform: route({
    method: "GET",
    path: "/vaults/:vaultId/files/:fileId/waveform",
    auth: "share-token",
    params: FileParams,
    query: TokenQuery,
    response: z.object({
      sampleRate: z.number().int(),
      samplesPerPixel: z.number().int(),
      bits: z.literal(8),
      length: z.number().int(),
      data: z.array(z.number().int()), // audiowaveform JSON v2 data array
    }),
    summary: "Precomputed peaks. 409 conflict until status is ready; 404 if not audio.",
  }),
};
