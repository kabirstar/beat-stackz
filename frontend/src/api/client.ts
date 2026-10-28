import {
  ApiError,
  routes,
  User,
  type Body,
  type Params,
  type Query,
  type Response,
  type Route,
} from "@bpackz/shared";
import { MOCK_API } from "@bpackz/shared/mocks";

export type BpackzErrorCode = ApiError["error"];

export class BpackzApiError extends Error {
  readonly status: number;
  readonly code: BpackzErrorCode;
  readonly issues?: { path: string; message: string }[];

  constructor(
    status: number,
    code: BpackzErrorCode,
    message: string,
    issues?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = "BpackzApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export interface RouteCallOptions<R extends Route> {
  params?: R["params"] extends undefined ? undefined : Params<R>;
  query?: R["query"] extends undefined ? undefined : Partial<Query<R>>;
  body?: R["body"] extends undefined ? undefined : Body<R>;
  signal?: AbortSignal;
}

function buildPath(pattern: string, params?: Record<string, string>): string {
  if (!params) return pattern;
  return pattern.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => {
    const val = params[key];
    if (val === undefined) {
      throw new Error(`Missing route parameter :${key} for ${pattern}`);
    }
    return encodeURIComponent(val);
  });
}

export function createApiClient(baseUrl: string = resolveDefaultApiOrigin()) {
  const origin = baseUrl.replace(/\/+$/, "");

  async function call<R extends Route>(
    routeDef: R,
    options: RouteCallOptions<R> = {},
  ): Promise<Response<R>> {
    const rawParams = options.params as Record<string, string> | undefined;
    const validatedParams = routeDef.params
      ? (routeDef.params.parse(rawParams) as Record<string, string>)
      : rawParams;

    const pathname = buildPath(routeDef.path, validatedParams);
    const url = new URL(origin + pathname);

    if (options.query) {
      const rawQuery = Object.fromEntries(
        Object.entries(options.query as Record<string, unknown>).filter(
          ([, v]) => v !== undefined && v !== null && v !== "",
        ),
      );
      const validatedQuery = routeDef.query
        ? (routeDef.query.parse(rawQuery) as Record<string, unknown>)
        : rawQuery;
      for (const [k, v] of Object.entries(validatedQuery)) {
        if (v !== undefined && v !== null) {
          url.searchParams.set(k, String(v));
        }
      }
    }

    const headers: Record<string, string> = {};
    let bodyStr: string | undefined;

    if (routeDef.body !== undefined && options.body !== undefined) {
      const validatedBody = routeDef.body.parse(options.body);
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(validatedBody);
    }

    const res = await fetch(url.toString(), {
      method: routeDef.method,
      headers,
      body: bodyStr,
      credentials: "include",
      signal: options.signal,
    });

    if (res.status >= 400) {
      const errJson = await res.json().catch(() => null);
      const parsedErr = ApiError.safeParse(errJson);
      if (parsedErr.success) {
        throw new BpackzApiError(
          res.status,
          parsedErr.data.error,
          parsedErr.data.message,
          parsedErr.data.issues,
        );
      }
      throw new BpackzApiError(
        res.status,
        res.status === 401
          ? "unauthorized"
          : res.status === 403
            ? "forbidden"
            : res.status === 404
              ? "not_found"
              : res.status === 409
                ? "conflict"
                : "invalid",
        errJson && typeof errJson.message === "string"
          ? errJson.message
          : `Request failed with status ${res.status}`,
      );
    }

    if (res.status === 204) {
      return {} as Response<R>;
    }

    const data = await res.json();
    return routeDef.response.parse(data) as Response<R>;
  }

  async function authRequest<T>(
    path: string,
    init: RequestInit,
    parseUser: (json: any) => T,
  ): Promise<T> {
    const res = await fetch(`${origin}/auth${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      const parsedErr = ApiError.safeParse(errJson);
      if (parsedErr.success) {
        throw new BpackzApiError(
          res.status,
          parsedErr.data.error,
          parsedErr.data.message,
          parsedErr.data.issues,
        );
      }
      const message =
        (errJson && typeof errJson.message === "string" && errJson.message) ||
        (res.status === 401
          ? "Invalid email or password"
          : res.status === 403
            ? "Invite code not recognized"
            : res.status === 422
              ? "An account with this email already exists"
              : `Authentication failed (${res.status})`);
      throw new BpackzApiError(
        res.status,
        res.status === 401
          ? "unauthorized"
          : res.status === 403
            ? "forbidden"
            : res.status === 422
              ? "conflict"
              : "invalid",
        message,
      );
    }
    const json = await res.json().catch(() => null);
    return parseUser(json);
  }

  return {
    origin,
    call,
    auth: {
      me: () => call(routes.auth.me),
      signInEmail: (input: { email: string; password: string }) =>
        authRequest("/sign-in/email", {
          method: "POST",
          body: JSON.stringify(input),
        }, (json) => ({ user: User.parse(json.user) })),
      signUpEmail: (input: {
        name: string;
        email: string;
        password: string;
        inviteCode?: string;
      }) =>
        authRequest(
          "/sign-up/email",
          {
            method: "POST",
            body: JSON.stringify({
              ...input,
              inviteCode: input.inviteCode?.trim() || "808",
            }),
          },
          (json) => ({ user: User.parse(json.user) }),
        ),
      signOut: async () => {
        await fetch(`${origin}/auth/sign-out`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      },
    },
    vaults: {
      list: () => call(routes.vaults.list),
      create: (body: Body<typeof routes.vaults.create>) =>
        call(routes.vaults.create, { body }),
      get: (vaultId: string) =>
        call(routes.vaults.get, { params: { vaultId } }),
      rename: (vaultId: string, body: Body<typeof routes.vaults.rename>) =>
        call(routes.vaults.rename, { params: { vaultId }, body }),
      members: (vaultId: string) =>
        call(routes.vaults.members, { params: { vaultId } }),
      invite: (vaultId: string, body: Body<typeof routes.vaults.invite>) =>
        call(routes.vaults.invite, { params: { vaultId }, body }),
      removeMember: (vaultId: string, userId: string) =>
        call(routes.vaults.removeMember, { params: { vaultId, userId } }),
    },
    folders: {
      create: (vaultId: string, body: Body<typeof routes.folders.create>) =>
        call(routes.folders.create, { params: { vaultId }, body }),
      get: (vaultId: string, folderId: string) =>
        call(routes.folders.get, { params: { vaultId, folderId } }),
      update: (
        vaultId: string,
        folderId: string,
        body: Body<typeof routes.folders.update>,
      ) => call(routes.folders.update, { params: { vaultId, folderId }, body }),
      trash: (vaultId: string, folderId: string) =>
        call(routes.folders.trash, { params: { vaultId, folderId } }),
    },
    files: {
      listChildren: (
        vaultId: string,
        query?: Partial<Query<typeof routes.files.listChildren>>,
      ) => call(routes.files.listChildren, { params: { vaultId }, query }),
      get: (vaultId: string, fileId: string) =>
        call(routes.files.get, { params: { vaultId, fileId } }),
      update: (
        vaultId: string,
        fileId: string,
        body: Body<typeof routes.files.update>,
      ) => call(routes.files.update, { params: { vaultId, fileId }, body }),
      trash: (vaultId: string, fileId: string) =>
        call(routes.files.trash, { params: { vaultId, fileId } }),
      downloadUrl: (
        vaultId: string,
        fileId: string,
        query?: Partial<Query<typeof routes.files.downloadUrl>>,
      ) => call(routes.files.downloadUrl, { params: { vaultId, fileId }, query }),
      waveform: (
        vaultId: string,
        fileId: string,
        query?: Partial<Query<typeof routes.files.waveform>>,
      ) => call(routes.files.waveform, { params: { vaultId, fileId }, query }),
    },
    uploads: {
      create: (vaultId: string, body: Body<typeof routes.uploads.create>) =>
        call(routes.uploads.create, { params: { vaultId }, body }),
      sign: (
        vaultId: string,
        uploadId: string,
        body: Body<typeof routes.uploads.sign>,
      ) => call(routes.uploads.sign, { params: { vaultId, uploadId }, body }),
      complete: (
        vaultId: string,
        uploadId: string,
        body: Body<typeof routes.uploads.complete>,
      ) => call(routes.uploads.complete, { params: { vaultId, uploadId }, body }),
      abort: (vaultId: string, uploadId: string, key: string) =>
        call(routes.uploads.abort, { params: { vaultId, uploadId }, query: { key } }),
    },
    shares: {
      list: (vaultId: string, fileId: string) =>
        call(routes.shares.list, { params: { vaultId, fileId } }),
      create: (
        vaultId: string,
        fileId: string,
        body: Body<typeof routes.shares.create>,
      ) => call(routes.shares.create, { params: { vaultId, fileId }, body }),
      revoke: (vaultId: string, fileId: string, shareId: string) =>
        call(routes.shares.revoke, { params: { vaultId, fileId, shareId } }),
      resolve: (token: string) =>
        call(routes.shares.resolve, { params: { token } }),
    },
  };
}

function resolveDefaultApiOrigin(): string {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (metaEnv?.VITE_API_ORIGIN) {
    return metaEnv.VITE_API_ORIGIN;
  }
  if (metaEnv?.VITE_MOCK === "false") {
    if (typeof window !== "undefined" && window.location?.hostname?.startsWith("app.")) {
      return `${window.location.protocol}//api.${window.location.hostname.slice(4)}`;
    }
    return "http://localhost:4000";
  }
  return MOCK_API;
}

export const api = createApiClient();
