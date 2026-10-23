// End-to-end smoke test against a running stack (T009). Node 24, no deps.
//   node infra/smoke.mjs            # API http://localhost:4000, web http://localhost:5173
//   API=... WEB=... node infra/smoke.mjs
// Signs up, lists vaults, creates a folder, uploads a real WAV via presigned multipart,
// waits for the worker to verify it (status ready + waveform), downloads it back and
// compares bytes, creates a share link, resolves it anonymously, revokes it, trashes the file.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

const API = process.env.API ?? "http://localhost:4000";
const WEB = process.env.WEB ?? "http://localhost:5173";
const ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";
let cookie = "";

const api = async (method, path, body, expect = 200, extra = {}) => {
  const res = await fetch(API + path, {
    method, headers: { cookie, origin: ORIGIN, "content-type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.status, expect, `${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  return [res, text ? JSON.parse(text) : null];
};
const step = (name) => console.log(`✔ ${name}`);

// 1 s of 440 Hz mono 16-bit WAV, 44.1 kHz, deterministic.
function wav() {
  const rate = 44100, n = rate, data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// --- web + api up
assert.equal((await fetch(WEB)).status, 200); step(`web serves ${WEB}`);
assert.deepEqual((await api("GET", "/health"))[1], { status: "ok" }); step("api /health");

// --- signup → session cookie → /me
const email = `smoke-${randomUUID()}@example.com`;
const [signup] = await api("POST", "/auth/sign-up/email", { name: "Smoke", email, password: randomUUID() });
cookie = signup.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
assert.ok(cookie, "no session cookie");
const [, me] = await api("GET", "/me");
const vaultId = me.personalVaultId;
step(`signup + /me (personal vault ${vaultId})`);

// --- vaults + folder
const [, vaults] = await api("GET", "/vaults");
assert.ok(vaults.items.some((v) => v.id === vaultId));
const [, folder] = await api("POST", `/vaults/${vaultId}/folders`, { parentId: null, name: `smoke-${Date.now()}` }, 201);
step(`folder ${folder.name}`);

// --- presigned multipart upload straight to the bucket
const bytes = wav();
const sha256 = createHash("sha256").update(bytes).digest("hex");
const [, up] = await api("POST", `/vaults/${vaultId}/uploads`,
  { folderId: folder.id, name: "smoke.wav", size: bytes.length, mime: "audio/wav", sha256 }, 201);
assert.equal(up.dedup, false, "fresh file should not dedup");
const [, signed] = await api("POST", `/vaults/${vaultId}/uploads/${up.uploadId}/sign`, { key: up.key, partNumbers: [1] });
const put = await fetch(signed.urls[0].url, { method: "PUT", body: bytes });
assert.equal(put.status, 200, `bucket PUT ${put.status} at ${new URL(signed.urls[0].url).origin}`);
const etag = put.headers.get("etag");
assert.ok(etag, "bucket returned no ETag");
const [, file] = await api("POST", `/vaults/${vaultId}/uploads/${up.uploadId}/complete`,
  { key: up.key, folderId: folder.id, name: "smoke.wav", mime: "audio/wav", sha256, parts: [{ partNumber: 1, etag }] }, 201);
step(`upload complete → file ${file.id} status=${file.status}`);

// --- worker verifies + waveform
let ready = file;
for (let i = 0; i < 60 && ready.status === "processing"; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  [, ready] = await api("GET", `/vaults/${vaultId}/files/${file.id}`);
}
assert.equal(ready.status, "ready", `worker did not verify within 60 s (status ${ready.status})`);
assert.equal(ready.hasWaveform, true, "no waveform after verification");
const [, wf] = await api("GET", `/vaults/${vaultId}/files/${file.id}/waveform`);
assert.equal(wf.data.length, wf.length * 2);
step(`worker verified: duration ${ready.durationMs} ms, ${wf.length} peaks`);

// --- download round-trips the bytes
const [, dl] = await api("GET", `/vaults/${vaultId}/files/${file.id}/download`);
const got = Buffer.from(await (await fetch(dl.url)).arrayBuffer());
assert.ok(got.equals(bytes), "downloaded bytes differ");
step("download bytes match");

// --- share link: create, resolve anonymously, revoke
const [, share] = await api("POST", `/vaults/${vaultId}/files/${file.id}/shares`, {}, 201);
const token = share.url.split("/s/")[1];
const saved = cookie; cookie = "";
const [, resolved] = await api("GET", `/s/${token}`);
assert.equal(resolved.file.id, file.id);
await api("GET", `/vaults/${vaultId}/files/${file.id}/download?token=${token}`);
cookie = saved;
await api("DELETE", `/vaults/${vaultId}/files/${file.id}/shares/${share.id}`, undefined, 204);
cookie = ""; await api("GET", `/s/${token}`, undefined, 404); cookie = saved;
step("share link create → anonymous resolve + download → revoke");

// --- trash
await api("DELETE", `/vaults/${vaultId}/files/${file.id}`, undefined, 204);
await api("GET", `/vaults/${vaultId}/files/${file.id}`, undefined, 404);
step("trash");

console.log("\nSMOKE OK");
