import { z } from "zod";
import { Id, Timestamp } from "../common.js";
import { route } from "../route.js";

// Better Auth owns /auth/* (sign-up, sign-in, sign-out, get-session).
// This is the user shape the web app relies on.
export const User = z.object({
  id: Id,
  email: z.string().email(),
  name: z.string().nullable(),
  createdAt: Timestamp,
});
export type User = z.infer<typeof User>;

export const authRoutes = {
  me: route({
    method: "GET",
    path: "/me",
    auth: "session",
    response: z.object({ user: User, personalVaultId: Id }),
    summary: "Current user + their personal vault id",
  }),
};
