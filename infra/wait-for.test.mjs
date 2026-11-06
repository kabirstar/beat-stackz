// node --test infra/wait-for.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { waitFor } from "./wait-for.mjs";

// Fake clock: sleeping advances it, nothing really waits.
const clock = () => {
  let t = 0;
  const sleeps = [];
  return { now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; }, sleeps };
};
const replies = (...list) => {
  let calls = 0;
  const fetch = async () => {
    const r = list[Math.min(calls++, list.length - 1)];
    if (r instanceof Error) throw r;
    return { status: r };
  };
  return { fetch, calls: () => calls };
};

test("retries past 502s and network errors until 200", async () => {
  const c = clock(), f = replies(502, new Error("ECONNREFUSED"), 503, 200);
  await waitFor("http://api/health", { fetch: f.fetch, ...c });
  assert.equal(f.calls(), 4);
  assert.deepEqual(c.sleeps, [3000, 3000, 3000]);
});

test("returns at once when already up", async () => {
  const c = clock(), f = replies(200);
  await waitFor("http://web", { fetch: f.fetch, ...c });
  assert.deepEqual(c.sleeps, []);
});

test("gives up at the deadline with the wait and the last status", async () => {
  const c = clock(), f = replies(502);
  await assert.rejects(waitFor("http://api/health", { fetch: f.fetch, ...c }), /http:\/\/api\/health not up after 90 s \(last: status 502\)/);
  assert.equal(f.calls(), 31); // t = 0, 3, ... 90 s
});

test("reports a network error as the last status", async () => {
  const c = clock(), f = replies(new Error("fetch failed", { cause: { code: "ECONNREFUSED" } }));
  await assert.rejects(waitFor("http://api/health", { fetch: f.fetch, ...c }), /last: network error: ECONNREFUSED/);
});
