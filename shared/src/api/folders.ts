import { z } from "zod";
import { FolderKind, Id, Name, Timestamp } from "../common.js";
import { route } from "../route.js";

export const Folder = z.object({
  id: Id,
  vaultId: Id,
  parentId: Id.nullable(), // null = vault root
  name: Name,
  // Set on seeded default folders (ADR 0002); null for user-created. `.default(null)` only so the
  // backend keeps parsing until T026a adds the column; remove the default after that lands.
  kind: FolderKind.nullable().default(null),
  createdBy: Id.nullable(),
  updatedAt: Timestamp,
});
export type Folder = z.infer<typeof Folder>;

export const Breadcrumb = z.array(z.object({ id: Id, name: Name }));

const VaultParams = z.object({ vaultId: Id });
const FolderParams = VaultParams.extend({ folderId: Id });

export const folderRoutes = {
  create: route({
    method: "POST",
    path: "/vaults/:vaultId/folders",
    auth: "session",
    status: 201,
    params: VaultParams,
    body: z.object({ parentId: Id.nullable(), name: Name }),
    response: Folder,
    summary: "Create folder. 409 on name collision in parent.",
  }),
  get: route({
    method: "GET",
    path: "/vaults/:vaultId/folders/:folderId",
    auth: "session",
    params: FolderParams,
    response: z.object({ folder: Folder, breadcrumb: Breadcrumb }),
    summary: "Folder + ancestors",
  }),
  update: route({
    method: "PATCH",
    path: "/vaults/:vaultId/folders/:folderId",
    auth: "session",
    params: FolderParams,
    body: z.object({
      name: Name.optional(),
      parentId: Id.nullable().optional(), // move
      ifUpdatedAt: Timestamp, // optimistic lock: 409 if stale
    }),
    response: Folder,
    summary: "Rename and/or move. 409 on collision or stale ifUpdatedAt.",
  }),
  trash: route({
    method: "DELETE",
    path: "/vaults/:vaultId/folders/:folderId",
    auth: "session",
    status: 204,
    params: FolderParams,
    response: z.object({}),
    summary: "Soft-delete folder and descendants",
  }),
};
