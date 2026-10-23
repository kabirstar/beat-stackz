import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupServer } from "msw/node";
import { createHandlers, MOCK_API, setMockVerifyMs } from "./handlers.js";
import { seed } from "./store.js";
import { PART_SIZE, DEFAULT_FOLDERS } from "../index.js";

const server = setupServer(...createHandlers(seed()));
before(() => { setMockVerifyMs(50); server.listen({ onUnhandledRequest: "error" }); });
after(() => server.close());

const api = async (method: string, path: string, body?: unknown, expect = 200) => {
  const res = await fetch(MOCK_API + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  assert.equal(res.status, expect, `${method} ${path} -> ${res.status} ${await res.clone().text()}`);
  return res.status === 204 ? null : res.json();
};

test("full vault flow: me -> vaults -> folder -> upload -> list -> share -> resolve -> trash", async () => {
  const me = await api("GET", "/me");
  assert.equal(me.personalVaultId, "v_personal");

  const vaults = await api("GET", "/vaults");
  assert.equal(vaults.items.length, 2);

  const folder = await api("POST", "/vaults/v_shared/folders", { parentId: "fo_proj", name: "Bounces" }, 201);
  await api("POST", "/vaults/v_shared/folders", { parentId: "fo_proj", name: "Bounces" }, 409);

  const sha = "b".repeat(64);
  const up = await api("POST", "/vaults/v_shared/uploads", { folderId: folder.id, name: "bounce_v1.wav", size: PART_SIZE * 2 + 5, mime: "audio/wav", sha256: sha }, 201);
  assert.equal(up.dedup, false);
  assert.equal(up.partCount, 3);

  const signed = await api("POST", `/vaults/v_shared/uploads/${up.uploadId}/sign`, { key: up.key, partNumbers: [1, 2, 3] });
  assert.equal(signed.urls.length, 3);
  const put = await fetch(signed.urls[0].url, { method: "PUT", body: new Uint8Array(8) });
  assert.ok(put.headers.get("ETag"));

  const file = await api("POST", `/vaults/v_shared/uploads/${up.uploadId}/complete`, {
    key: up.key, folderId: folder.id, name: "bounce_v1.wav", mime: "audio/wav", sha256: sha,
    parts: signed.urls.map((u: { partNumber: number }) => ({ partNumber: u.partNumber, etag: `"e${u.partNumber}"` })),
  }, 201);
  assert.equal(file.status, "processing"); // ADR 0001: not trusted until the worker verifies
  assert.equal(file.sha256, null);
  await api("GET", `/vaults/v_shared/files/${file.id}/download`, undefined, 409);
  // claimed hash of a processing (unverified) file must NOT dedup
  const early = await api("POST", "/vaults/v_personal/uploads", { folderId: null, name: "early.wav", size: 1, mime: "audio/wav", sha256: sha }, 201);
  assert.equal(early.dedup, false);
  await new Promise((r) => setTimeout(r, 120));
  const verified = await api("GET", `/vaults/v_shared/files/${file.id}`);
  assert.equal(verified.status, "ready");
  assert.equal(verified.hasWaveform, true);

  // dedup path: verified sha behind a file I can read = no upload needed
  const dup = await api("POST", "/vaults/v_personal/uploads", { folderId: null, name: "copy.wav", size: 1, mime: "audio/wav", sha256: sha }, 201);
  assert.equal(dup.dedup, true);
  assert.equal(dup.file.status, "ready");

  const kids = await api("GET", `/vaults/v_shared/children?folderId=${folder.id}`);
  assert.deepEqual(kids.files.map((f: { name: string }) => f.name), ["bounce_v1.wav"]);

  const wf = await api("GET", `/vaults/v_shared/files/${file.id}/waveform`);
  assert.equal(wf.data.length, wf.length * 2);

  await api("POST", `/vaults/v_shared/files/${file.id}/shares`, { role: "edit" }, 400); // edit link w/o grantee
  const share = await api("POST", `/vaults/v_shared/files/${file.id}/shares`, {}, 201);
  const token = share.url.split("/s/")[1];
  const resolved = await api("GET", `/s/${token}`);
  assert.equal(resolved.file.id, file.id);
  const dl = await api("GET", `/vaults/v_shared/files/${file.id}/download?token=${token}&disposition=inline`);
  assert.match(dl.url, /disposition=inline/);

  await api("DELETE", `/vaults/v_shared/files/${file.id}/shares/${share.id}`, undefined, 204);
  await api("GET", `/s/${token}`, undefined, 404);

  // stale optimistic lock
  await api("PATCH", `/vaults/v_shared/folders/${folder.id}`, { name: "Renamed", ifUpdatedAt: "2000-01-01T00:00:00.000Z" }, 409);
  await api("PATCH", `/vaults/v_shared/folders/${folder.id}`, { name: "Renamed", ifUpdatedAt: folder.updatedAt });

  await api("DELETE", `/vaults/v_shared/folders/${folder.id}`, undefined, 204);
  const after = await api("GET", "/vaults/v_shared/children?folderId=fo_proj");
  assert.equal(after.folders.some((f: { id: string }) => f.id === folder.id), false);
});

test("knowing a hash is not authorization (ADR 0001)", async () => {
  // fi_bass lives in v_shared; a second store where the caller is NOT a member of v_shared must not dedup it
  const s = seed();
  s.members = s.members.filter((m) => !(m.vaultId === "v_shared" && m.userId === s.me.id));
  const srv = setupServer(...createHandlers(s));
  server.close(); srv.listen({ onUnhandledRequest: "error" });
  try {
    const bass = s.files.find((f) => f.id === "fi_bass")!;
    const r = await api("POST", "/vaults/v_personal/uploads", { folderId: null, name: "stolen.wav", size: bass.size, mime: bass.mime, sha256: bass.sha256! }, 201);
    assert.equal(r.dedup, false, "must require a real upload");
    assert.doesNotMatch(r.key, new RegExp(bass.sha256!), "key must be opaque");
  } finally { srv.close(); server.listen({ onUnhandledRequest: "error" }); }
});

test("new vaults are seeded with the default taxonomy; user folders have kind null", async () => {
  const v = await api("POST", "/vaults", { name: "Seeded" }, 201);
  const root = await api("GET", `/vaults/${v.id}/children`);
  assert.deepEqual(root.folders.map((f: { kind: string }) => f.kind), DEFAULT_FOLDERS.map((d) => d.kind));
  const songs = root.folders.find((f: { kind: string }) => f.kind === "songs");
  const subs = await api("GET", `/vaults/${v.id}/children?folderId=${songs.id}`);
  assert.deepEqual(subs.folders.map((f: { kind: string }) => f.kind), ["songs/demo", "songs/mix", "songs/drop"]);
  const custom = await api("POST", `/vaults/${v.id}/folders`, { parentId: null, name: "Custom" }, 201);
  assert.equal(custom.kind, null);
});

test("validation and permissions", async () => {
  await api("POST", "/vaults/v_shared/folders", { parentId: null, name: "a/b" }, 400);
  await api("GET", "/vaults/v_nope", undefined, 403); // non-member and missing look the same, as in backend
  await api("DELETE", "/vaults/v_personal/members/u_me", undefined, 409); // last owner
  await api("POST", "/vaults/v_shared/members", { email: "nobody@bpackz.test", role: "viewer" }, 404);
});
