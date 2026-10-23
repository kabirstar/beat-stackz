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

/**
 * Sign-up body (ADR 0003). Better Auth owns POST /auth/sign-up/email; the API adds a `before` hook that
 * rejects the request with 403 `forbidden` unless `inviteCode` equals the server's INVITE_CODE env.
 * Sign-in needs no code. The front door collects the code and passes it here; nothing is validated client-side.
 */
export const SignUpBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(256),
  inviteCode: z.string().trim().min(1).max(64),
});
export type SignUpBody = z.infer<typeof SignUpBody>;
