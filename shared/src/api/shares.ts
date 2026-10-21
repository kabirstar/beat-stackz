import { z } from "zod";
import { Id, ShareRole, Timestamp } from "../common.js";
import { FileItem } from "./files.js";
import { route } from "../route.js";

export const Share = z.object({
  id: Id,
  fileId: Id, // folder shares: v2
  granteeUserId: Id.nullable(), // null = link share
  role: ShareRole,
  expiresAt: Timestamp.nullable(),
  createdBy: Id,
  createdAt: Timestamp,
  /** Only present in the create response; the raw token is never returned again. */
  url: z.string().url().optional(),
});
export type Share = z.infer<typeof Share>;

const FileParams = z.object({ vaultId: Id, fileId: Id });

export const shareRoutes = {
  list: route({
    method: "GET",
    path: "/vaults/:vaultId/files/:fileId/shares",
    auth: "session",
    params: FileParams,
    response: z.object({ items: z.array(Share) }),
    summary: "Active shares on a file",
  }),
  create: route({
    method: "POST",
    path: "/vaults/:vaultId/files/:fileId/shares",
    auth: "session",
    status: 201,
    params: FileParams,
    body: z.object({
      granteeEmail: z.string().email().optional(), // omit = link share
      role: ShareRole.default("view"), // edit requires a grantee; server enforces
      expiresInHours: z.number().int().min(1).max(24 * 365).default(24 * 7),
    }),
    response: Share,
    summary: "Create share; link token returned once in url",
  }),
  revoke: route({
    method: "DELETE",
    path: "/vaults/:vaultId/files/:fileId/shares/:shareId",
    auth: "session",
    status: 204,
    params: FileParams.extend({ shareId: Id }),
    response: z.object({}),
    summary: "Revoke",
  }),
  /** Public landing for a link. Download via files.downloadUrl with ?token=. */
  resolve: route({
    method: "GET",
    path: "/s/:token",
    auth: "public",
    params: z.object({ token: z.string().min(32) }),
    response: z.object({ file: FileItem, role: ShareRole, expiresAt: Timestamp.nullable() }),
    summary: "Resolve a share link (404 if revoked or expired)",
  }),
};
