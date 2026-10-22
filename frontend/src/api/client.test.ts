import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setMockVerifyMs } from "@bpackz/shared/mocks";
import { setupServer } from "msw/node";
import { createFrontendMockHandlers } from "../mocks/handlers.ts";
import { api } from "./client.ts";

describe("Typed API Client + MSW Mock Handlers (T020 & T021)", () => {
  const { handlers } = createFrontendMockHandlers();
  const server = setupServer(...handlers);

  before(() => {
    setMockVerifyMs(0);
    server.listen({ onUnhandledRequest: "error" });
  });

  after(() => {
    server.close();
  });

  it("authenticates Swish and Todo and lists personal & shared vaults", async () => {
    const meRes = await api.auth.me();
    assert.equal(meRes.user.name, "Swish");

    const vaultsRes = await api.vaults.list();
    assert.ok(vaultsRes.items.length >= 2);
    const personal = vaultsRes.items.find((v) => v.kind === "personal");
    const shared = vaultsRes.items.find((v) => v.kind === "shared");
    assert.ok(personal);
    assert.ok(shared);
    assert.equal(shared.name, "Swish × Todo");
  });

  it("lists seeded 3D studio root folders and subfolders", async () => {
    const { items } = await api.vaults.list();
    const personal = items.find((v) => v.kind === "personal")!;
    const rootChildren = await api.files.listChildren(personal.id);
    const rootNames = rootChildren.folders.map((f) => f.name).sort();
    assert.deepEqual(rootNames, ["beats", "media", "presets", "songs", "vocals"]);

    const vocalsRoot = rootChildren.folders.find((f) => f.name === "vocals")!;
    const vocalChildren = await api.files.listChildren(personal.id, {
      folderId: vocalsRoot.id,
    });
    const subNames = vocalChildren.folders.map((sf) => sf.name).sort();
    assert.deepEqual(subNames, ["adlib", "bg", "main"]);
  });

  it("runs presigned multipart upload, waveform, download URL, share link, and soft-delete", async () => {
    const { items } = await api.vaults.list();
    const personal = items.find((v) => v.kind === "personal")!;
    const rootChildren = await api.files.listChildren(personal.id);
    const beatsFolder = rootChildren.folders.find((f) => f.name === "beats")!;

    const sha256 = "f".repeat(64);
    const init = await api.uploads.create(personal.id, {
      folderId: beatsFolder.id,
      name: "swish_808_test_stem.wav",
      size: 1024 * 512,
      mime: "audio/wav",
      sha256,
    });

    assert.equal(init.dedup, false);
    if (!init.dedup) {
      const signed = await api.uploads.sign(personal.id, init.uploadId, {
        key: init.key,
        partNumbers: [1],
      });
      assert.equal(signed.urls.length, 1);

      const putRes = await fetch(signed.urls[0].url, {
        method: "PUT",
        body: new Uint8Array([1, 2, 3, 4]),
      });
      const etag = putRes.headers.get("ETag") || '"etag-1"';

      const completed = await api.uploads.complete(personal.id, init.uploadId, {
        key: init.key,
        folderId: beatsFolder.id,
        name: "swish_808_test_stem.wav",
        mime: "audio/wav",
        sha256,
        parts: [{ partNumber: 1, etag }],
      });
      assert.equal(completed.name, "swish_808_test_stem.wav");
      await new Promise((r) => setTimeout(r, 10));

      const dl = await api.files.downloadUrl(personal.id, completed.id, {
        disposition: "attachment",
      });
      assert.ok(dl.url.startsWith("http"));

      const wf = await api.files.waveform(personal.id, completed.id);
      assert.equal(wf.bits, 8);
      assert.ok(wf.data.length > 0);

      const share = await api.shares.create(personal.id, completed.id, {
        role: "view",
        expiresInHours: 24,
      });
      assert.ok(share.url?.includes("/s/"));

      const shareList = await api.shares.list(personal.id, completed.id);
      assert.equal(shareList.items.length, 1);

      await api.shares.revoke(personal.id, completed.id, share.id);
      const afterRevoke = await api.shares.list(personal.id, completed.id);
      assert.equal(afterRevoke.items.length, 0);

      await api.files.trash(personal.id, completed.id);
    }
  });
});
