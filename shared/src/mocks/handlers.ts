import { http, HttpResponse, type HttpHandler } from "msw";
import type { z } from "zod";
import { routes, PART_SIZE } from "../index.js";
import type { Route } from "../route.js";
import { seed, newId, now, type Store } from "./store.js";

export const MOCK_API = "http://localhost:4000";
export const MOCK_BUCKET = "http://localhost:9000/bpackz";
/** How long a completed upload stays "processing" before the fake worker marks it ready. */
export let MOCK_VERIFY_MS = 1500;
export const setMockVerifyMs = (ms: number) => { MOCK_VERIFY_MS = ms; };

type Ctx = { params: Record<string, string>; query: URLSearchParams; body: any; store: Store };
type Result = { status?: number; body?: unknown } | HttpResponse<any>;

const err = (status: number, error: string, message = error) => ({ status, body: { error, message } });

/** Wire one contract route into msw. Validates the request body and the response against the schemas. */
function mock<R extends Route>(route: R, store: Store, impl: (c: Ctx) => Result) {
  const method = route.method.toLowerCase() as "get" | "post" | "patch" | "delete";
  return http[method](MOCK_API + route.path, async ({ request, params }) => {
    let body: unknown = undefined;
    if (route.body) {
      const parsed = route.body.safeParse(await request.json().catch(() => undefined));
      if (!parsed.success) {
        return HttpResponse.json({ error: "invalid", message: "validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
      }
      body = parsed.data;
    }
    const url = new URL(request.url);
    if (route.query) {
      const q = route.query.safeParse(Object.fromEntries(url.searchParams));
      if (!q.success) return HttpResponse.json({ error: "invalid", message: "bad query" }, { status: 400 });
    }
    const out = impl({ params: params as Record<string, string>, query: url.searchParams, body, store });
    if (out instanceof HttpResponse) return out;
    const status = out.status ?? route.status ?? 200;
    if (status >= 400 || status === 204) return new HttpResponse(status === 204 ? null : JSON.stringify(out.body), { status, headers: { "content-type": "application/json" } });
    const checked = (route.response as z.ZodTypeAny).parse(out.body); // throws if a mock drifts from the contract
    return HttpResponse.json(checked as Record<string, unknown>, { status });
  });
}

export function createHandlers(store: Store = seed()): HttpHandler[] {
  const myRole = (vaultId: string) => store.members.find((m) => m.vaultId === vaultId && m.userId === store.me.id)?.role;
  const vaultOut = (v: Store["vaults"][number]) => ({ ...v, myRole: myRole(v.id)! });
  const member = (vaultId: string) => (myRole(vaultId) ? null : err(403, "forbidden"));
  const editor = (vaultId: string) => (["owner", "editor"].includes(myRole(vaultId) ?? "") ? null : err(403, "forbidden"));
  const collides = (vaultId: string, parentId: string | null, name: string, exceptId?: string) =>
    store.folders.some((f) => f.vaultId === vaultId && f.parentId === parentId && f.name === name && f.id !== exceptId) ||
    store.files.some((f) => f.vaultId === vaultId && f.folderId === parentId && f.name === name && f.id !== exceptId);
  const breadcrumb = (folderId: string | null) => {
    const out: { id: string; name: string }[] = [];
    for (let f = store.folders.find((x) => x.id === folderId); f; f = store.folders.find((x) => x.id === f!.parentId)) out.unshift({ id: f.id, name: f.name });
    return out;
  };
  const descendants = (folderId: string): string[] => {
    const kids = store.folders.filter((f) => f.parentId === folderId).map((f) => f.id);
    return [folderId, ...kids.flatMap(descendants)];
  };
  const shareFor = (fileId: string, token: string | null) =>
    store.shares.find((s) => s.fileId === fileId && !s.revokedAt && (!s.expiresAt || s.expiresAt > now()) && (token ? s.token === token : s.granteeUserId === store.me.id));
  const canRead = (file: { id: string; vaultId: string }, token: string | null) => !!myRole(file.vaultId) || !!shareFor(file.id, token);
  const peaks = (n: number) => Array.from({ length: n * 2 }, (_, i) => (i % 2 ? 1 : -1) * Math.round(40 + 80 * Math.abs(Math.sin(i / 7))));

  return [
    mock(routes.auth.me, store, () => ({ body: { user: store.me, personalVaultId: store.vaults.find((v) => v.kind === "personal")!.id } })),

    mock(routes.vaults.list, store, () => ({ body: { items: store.vaults.filter((v) => myRole(v.id)).map(vaultOut) } })),
    mock(routes.vaults.create, store, ({ body }) => {
      const v = { id: newId("v"), kind: "shared" as const, name: body.name, createdAt: now() };
      store.vaults.push(v);
      store.members.push({ vaultId: v.id, userId: store.me.id, role: "owner" });
      return { body: vaultOut(v) };
    }),
    mock(routes.vaults.get, store, ({ params }) => {
      const v = store.vaults.find((x) => x.id === params.vaultId);
      return !v || !myRole(v.id) ? err(403, "forbidden", "Vault access denied") : { body: vaultOut(v) }; // matches backend member()
    }),
    mock(routes.vaults.rename, store, ({ params, body }) => {
      const v = store.vaults.find((x) => x.id === params.vaultId);
      if (!v) return err(404, "not_found");
      if (myRole(v.id) !== "owner") return err(403, "forbidden");
      v.name = body.name;
      return { body: vaultOut(v) };
    }),
    mock(routes.vaults.members, store, ({ params }) =>
      member(params.vaultId!) ?? {
        body: { items: store.members.filter((m) => m.vaultId === params.vaultId).map((m) => ({ userId: m.userId, role: m.role, ...pick(store.users.find((u) => u.id === m.userId)!) })) },
      }),
    mock(routes.vaults.invite, store, ({ params, body }) => {
      if (myRole(params.vaultId!) !== "owner") return err(403, "forbidden");
      const u = store.users.find((x) => x.email === body.email);
      if (!u) return err(404, "not_found", "no user with that email");
      if (store.members.some((m) => m.vaultId === params.vaultId && m.userId === u.id)) return err(409, "conflict", "already a member");
      store.members.push({ vaultId: params.vaultId!, userId: u.id, role: body.role });
      return { body: { userId: u.id, role: body.role, ...pick(u) } };
    }),
    mock(routes.vaults.removeMember, store, ({ params }) => {
      const self = params.userId === store.me.id;
      if (!self && myRole(params.vaultId!) !== "owner") return err(403, "forbidden");
      const target = store.members.find((m) => m.vaultId === params.vaultId && m.userId === params.userId);
      if (!target) return err(404, "not_found");
      const owners = store.members.filter((m) => m.vaultId === params.vaultId && m.role === "owner").length;
      if (target.role === "owner" && owners === 1) return err(409, "conflict", "last owner");
      store.members = store.members.filter((m) => m !== target);
      return { status: 204 };
    }),

    mock(routes.folders.create, store, ({ params, body }) => {
      const denied = editor(params.vaultId!);
      if (denied) return denied;
      if (body.parentId && !store.folders.some((f) => f.id === body.parentId && f.vaultId === params.vaultId)) return err(404, "not_found", "parent");
      if (collides(params.vaultId!, body.parentId, body.name)) return err(409, "conflict");
      const f = { id: newId("fo"), vaultId: params.vaultId!, parentId: body.parentId, name: body.name, createdBy: store.me.id, updatedAt: now() };
      store.folders.push(f);
      return { body: f };
    }),
    mock(routes.folders.get, store, ({ params }) => {
      const denied = member(params.vaultId!);
      if (denied) return denied;
      const f = store.folders.find((x) => x.id === params.folderId && x.vaultId === params.vaultId);
      return !f ? err(404, "not_found") : { body: { folder: f, breadcrumb: breadcrumb(f.id) } };
    }),
    mock(routes.folders.update, store, ({ params, body }) => {
      const f = store.folders.find((x) => x.id === params.folderId && x.vaultId === params.vaultId);
      if (!f) return err(404, "not_found");
      const denied = editor(f.vaultId);
      if (denied) return denied;
      if (f.updatedAt !== body.ifUpdatedAt) return err(409, "conflict", "stale");
      const parentId = body.parentId === undefined ? f.parentId : body.parentId;
      const name = body.name ?? f.name;
      if (parentId && descendants(f.id).includes(parentId)) return err(409, "conflict", "cannot move into own subtree");
      if (collides(f.vaultId, parentId, name, f.id)) return err(409, "conflict");
      Object.assign(f, { parentId, name, updatedAt: now() });
      return { body: f };
    }),
    mock(routes.folders.trash, store, ({ params }) => {
      const f = store.folders.find((x) => x.id === params.folderId && x.vaultId === params.vaultId);
      if (!f) return err(404, "not_found");
      const denied = editor(f.vaultId);
      if (denied) return denied;
      const gone = new Set(descendants(f.id));
      store.folders = store.folders.filter((x) => !gone.has(x.id));
      store.files = store.files.filter((x) => !x.folderId || !gone.has(x.folderId));
      return { status: 204 };
    }),

    mock(routes.files.listChildren, store, ({ params, query }) => {
      const denied = member(params.vaultId!);
      if (denied) return denied;
      const folderId = query.get("folderId") ?? null;
      return {
        body: {
          folders: store.folders.filter((f) => f.vaultId === params.vaultId && f.parentId === folderId),
          files: store.files.filter((f) => f.vaultId === params.vaultId && f.folderId === folderId),
          nextCursor: null,
        },
      };
    }),
    mock(routes.files.get, store, ({ params }) => {
      const denied = member(params.vaultId!);
      if (denied) return denied;
      const f = store.files.find((x) => x.id === params.fileId && x.vaultId === params.vaultId);
      return !f ? err(404, "not_found") : { body: f };
    }),
    mock(routes.files.update, store, ({ params, body }) => {
      const f = store.files.find((x) => x.id === params.fileId && x.vaultId === params.vaultId);
      if (!f) return err(404, "not_found");
      const denied = editor(f.vaultId) ?? (body.toVaultId ? editor(body.toVaultId) : null);
      if (denied) return denied;
      if (f.updatedAt !== body.ifUpdatedAt) return err(409, "conflict", "stale");
      const vaultId = body.toVaultId ?? f.vaultId;
      const folderId = body.folderId === undefined ? (body.toVaultId ? null : f.folderId) : body.folderId;
      const name = body.name ?? f.name;
      if (collides(vaultId, folderId, name, f.id)) return err(409, "conflict");
      Object.assign(f, { vaultId, folderId, name, updatedAt: now() });
      return { body: f };
    }),
    mock(routes.files.trash, store, ({ params }) => {
      const f = store.files.find((x) => x.id === params.fileId && x.vaultId === params.vaultId);
      if (!f) return err(404, "not_found");
      const denied = editor(f.vaultId);
      if (denied) return denied;
      store.files = store.files.filter((x) => x !== f);
      return { status: 204 };
    }),
    mock(routes.files.downloadUrl, store, ({ params, query }) => {
      const f = store.files.find((x) => x.id === params.fileId && x.vaultId === params.vaultId);
      if (!f || !canRead(f, query.get("token"))) return err(404, "not_found");
      if (f.status !== "ready") return err(409, "conflict", `file is ${f.status}`);
      return { body: { url: `${MOCK_BUCKET}/${f.sha256}?disposition=${query.get("disposition") ?? "attachment"}&sig=mock`, expiresAt: new Date(Date.now() + 300_000).toISOString() } };
    }),
    mock(routes.files.waveform, store, ({ params, query }) => {
      const f = store.files.find((x) => x.id === params.fileId && x.vaultId === params.vaultId);
      if (!f || !canRead(f, query.get("token"))) return err(404, "not_found");
      if (f.status !== "ready") return err(409, "conflict", `file is ${f.status}`);
      if (!f.hasWaveform) return err(404, "not_found", "not audio");
      const length = Math.max(64, Math.round((f.durationMs ?? 0) / 100));
      return { body: { sampleRate: 44100, samplesPerPixel: 4410, bits: 8, length, data: peaks(length) } };
    }),

    mock(routes.uploads.create, store, ({ params, body }) => {
      const denied = editor(params.vaultId!);
      if (denied) return denied;
      // ADR 0001: dedup only against a verified blob behind a file the caller can already read
      const existing = store.files.find((f) => f.sha256 === body.sha256 && f.status === "ready" && myRole(f.vaultId));
      if (existing) {
        if (collides(params.vaultId!, body.folderId, body.name)) return err(409, "conflict");
        const file = { ...existing, id: newId("fi"), vaultId: params.vaultId!, folderId: body.folderId, name: body.name, createdAt: now(), updatedAt: now() };
        store.files.push(file);
        return { body: { dedup: true as const, file } };
      }
      if (collides(params.vaultId!, body.folderId, body.name)) return err(409, "conflict");
      const up = { uploadId: newId("up"), vaultId: params.vaultId!, key: `blobs/${newId("blob")}`, size: body.size }; // opaque key
      store.uploads.push(up);
      return { body: { dedup: false as const, uploadId: up.uploadId, key: up.key, partSize: PART_SIZE, partCount: Math.max(1, Math.ceil(body.size / PART_SIZE)) } };
    }),
    mock(routes.uploads.sign, store, ({ params, body }) => {
      const up = store.uploads.find((u) => u.uploadId === params.uploadId && u.vaultId === params.vaultId);
      if (!up) return err(404, "not_found");
      return { body: { urls: body.partNumbers.map((n: number) => ({ partNumber: n, url: `${MOCK_BUCKET}/${up.key}?partNumber=${n}&uploadId=${up.uploadId}&sig=mock` })), expiresAt: new Date(Date.now() + 900_000).toISOString() } };
    }),
    mock(routes.uploads.complete, store, ({ params, body }) => {
      const up = store.uploads.find((u) => u.uploadId === params.uploadId && u.vaultId === params.vaultId);
      if (!up) return err(404, "not_found");
      if (collides(params.vaultId!, body.folderId, body.name)) return err(409, "conflict");
      const isAudio = (body.mime ?? "").startsWith("audio/");
      // processing until the "worker" verifies; flips to ready shortly after so UIs can show the state
      const file: typeof store.files[number] = { id: newId("fi"), vaultId: params.vaultId!, folderId: body.folderId, name: body.name, status: "processing", size: up.size, mime: body.mime, sha256: null, durationMs: null, hasWaveform: false, createdBy: store.me.id, createdAt: now(), updatedAt: now() };
      store.files.push(file);
      store.uploads = store.uploads.filter((u) => u !== up);
      setTimeout(() => Object.assign(file, { status: "ready", sha256: body.sha256, durationMs: isAudio ? 180_000 : null, hasWaveform: isAudio, updatedAt: now() }), MOCK_VERIFY_MS);
      return { body: file };
    }),
    mock(routes.uploads.abort, store, ({ params }) => {
      store.uploads = store.uploads.filter((u) => u.uploadId !== params.uploadId);
      return { status: 204 };
    }),

    mock(routes.shares.list, store, ({ params }) =>
      member(params.vaultId!) ?? { body: { items: store.shares.filter((s) => s.fileId === params.fileId && !s.revokedAt).map(stripToken) } }),
    mock(routes.shares.create, store, ({ params, body }) => {
      const f = store.files.find((x) => x.id === params.fileId && x.vaultId === params.vaultId);
      if (!f) return err(404, "not_found");
      const denied = editor(f.vaultId);
      if (denied) return denied;
      let granteeUserId: string | null = null;
      if (body.granteeEmail) {
        const u = store.users.find((x) => x.email === body.granteeEmail);
        if (!u) return err(404, "not_found", "no user with that email");
        granteeUserId = u.id;
      } else if (body.role === "edit") return err(400, "invalid", "edit links require a grantee");
      const token = granteeUserId ? null : newId("tok").padEnd(40, "x");
      const s = { id: newId("sh"), fileId: f.id, granteeUserId, role: body.role, expiresAt: new Date(Date.now() + body.expiresInHours * 3_600_000).toISOString(), createdBy: store.me.id, createdAt: now(), token, revokedAt: null };
      store.shares.push(s);
      return { body: { ...stripToken(s), ...(token ? { url: `${MOCK_API.replace("4000", "5173")}/s/${token}` } : {}) } };
    }),
    mock(routes.shares.revoke, store, ({ params }) => {
      const s = store.shares.find((x) => x.id === params.shareId && x.fileId === params.fileId);
      if (!s) return err(404, "not_found");
      s.revokedAt = now();
      return { status: 204 };
    }),
    mock(routes.shares.resolve, store, ({ params }) => {
      const s = store.shares.find((x) => x.token === params.token && !x.revokedAt && (!x.expiresAt || x.expiresAt > now()));
      const f = s && store.files.find((x) => x.id === s.fileId);
      return !s || !f ? err(404, "not_found") : { body: { file: f, role: s.role, expiresAt: s.expiresAt } };
    }),

    // Fake bucket: accept part PUTs and GETs so the Uppy flow and <audio> src resolve.
    http.put(`${MOCK_BUCKET}/*`, () => new HttpResponse(null, { status: 200, headers: { ETag: `"${newId("etag")}"` } })),
    http.get(`${MOCK_BUCKET}/*`, () => new HttpResponse(new Uint8Array(1024), { status: 200, headers: { "content-type": "application/octet-stream", "accept-ranges": "bytes" } })),
  ];
}

const pick = (u: { email: string; name: string | null }) => ({ email: u.email, name: u.name });
const stripToken = ({ token: _t, revokedAt: _r, ...s }: Store["shares"][number]) => s;

/** Default handlers over a fresh seeded store. Import `createHandlers(seed())` to reset between tests. */
export const handlers = createHandlers();
