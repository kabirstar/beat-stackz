import { z } from "zod";
import { Id, Name, Timestamp, VaultKind, VaultRole } from "../common.js";
import { route } from "../route.js";

export const Vault = z.object({
  id: Id,
  kind: VaultKind,
  name: Name,
  myRole: VaultRole,
  createdAt: Timestamp,
});
export type Vault = z.infer<typeof Vault>;

export const VaultMember = z.object({
  userId: Id,
  email: z.string().email(),
  name: z.string().nullable(),
  role: VaultRole,
});
export type VaultMember = z.infer<typeof VaultMember>;

const VaultParams = z.object({ vaultId: Id });

export const vaultRoutes = {
  list: route({
    method: "GET",
    path: "/vaults",
    auth: "session",
    response: z.object({ items: z.array(Vault) }),
    summary: "Vaults the caller is a member of",
  }),
  create: route({
    method: "POST",
    path: "/vaults",
    auth: "session",
    status: 201,
    body: z.object({ name: Name }),
    response: Vault,
    summary: "Create a shared vault; caller becomes owner",
  }),
  get: route({
    method: "GET",
    path: "/vaults/:vaultId",
    auth: "session",
    params: VaultParams,
    response: Vault,
    summary: "One vault",
  }),
  rename: route({
    method: "PATCH",
    path: "/vaults/:vaultId",
    auth: "session",
    params: VaultParams,
    body: z.object({ name: Name }),
    response: Vault,
    summary: "Rename (owner only)",
  }),
  members: route({
    method: "GET",
    path: "/vaults/:vaultId/members",
    auth: "session",
    params: VaultParams,
    response: z.object({ items: z.array(VaultMember) }),
    summary: "List members",
  }),
  invite: route({
    method: "POST",
    path: "/vaults/:vaultId/members",
    auth: "session",
    status: 201,
    params: VaultParams,
    body: z.object({ email: z.string().email(), role: z.enum(["editor", "viewer"]) }),
    response: VaultMember,
    summary: "Add an existing user by email (owner only). 404 if no such user.",
  }),
  removeMember: route({
    method: "DELETE",
    path: "/vaults/:vaultId/members/:userId",
    auth: "session",
    status: 204,
    params: VaultParams.extend({ userId: Id }),
    response: z.object({}),
    summary: "Remove member (owner, or self). 409 if last owner.",
  }),
};
