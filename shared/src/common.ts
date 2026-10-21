import { z } from "zod";

export const Id = z.string().min(1).max(64);
export const Timestamp = z.string().datetime(); // ISO 8601, UTC
export const Name = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((s) => !s.includes("/"), "no slashes");

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
