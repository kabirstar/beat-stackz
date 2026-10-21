import { test } from "node:test";
import assert from "node:assert/strict";
import { routes, PART_SIZE, MAX_PARTS, Name } from "./index.js";
import type { Route } from "./route.js";

test("every route has a unique method+path, a response, and params for each :segment", () => {
  const seen = new Set<string>();
  for (const group of Object.values(routes)) {
    for (const r of Object.values(group) as Route[]) {
      const key = `${r.method} ${r.path}`;
      assert.ok(!seen.has(key), `duplicate ${key}`);
      seen.add(key);
      assert.ok(r.response, `${key} missing response`);
      for (const m of r.path.matchAll(/:(\w+)/g)) {
        assert.ok(r.params && m[1]! in r.params.shape, `${key} missing param ${m[1]}`);
      }
    }
  }
});

test("uploads.create rejects oversize and bad sha", () => {
  const body = routes.uploads.create.body;
  const ok = { folderId: null, name: "a.wav", size: 10, mime: "audio/wav", sha256: "a".repeat(64) };
  assert.equal(body.safeParse({ ...ok, size: PART_SIZE * (MAX_PARTS + 1) }).success, false);
  assert.equal(body.safeParse({ ...ok, sha256: "zz" }).success, false);
  assert.equal(body.safeParse(ok).success, true);
});

test("Name forbids slashes and trims", () => {
  assert.equal(Name.safeParse("a/b").success, false);
  assert.equal(Name.parse("  stems  "), "stems");
});
