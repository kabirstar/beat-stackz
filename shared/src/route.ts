import { z } from "zod";

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface Route {
  method: Method;
  /** Express-style path, e.g. "/vaults/:vaultId/folders" */
  path: string;
  /** "session" = logged in; "share-token" = session OR ?token=; "public" = none */
  auth: "session" | "share-token" | "public";
  params?: z.ZodObject<any>;
  query?: z.ZodObject<any>;
  body?: z.ZodTypeAny;
  response: z.ZodTypeAny;
  /** HTTP status on success; default 200 */
  status?: 200 | 201 | 204;
  summary: string;
}

/** Identity helper that keeps literal types for the client generator. */
export const route = <const R extends Route>(r: R) => r;

export type Params<R extends Route> = R["params"] extends z.ZodTypeAny ? z.infer<R["params"]> : never;
export type Query<R extends Route> = R["query"] extends z.ZodTypeAny ? z.infer<R["query"]> : never;
export type Body<R extends Route> = R["body"] extends z.ZodTypeAny ? z.infer<R["body"]> : never;
export type Response<R extends Route> = z.infer<R["response"]>;
