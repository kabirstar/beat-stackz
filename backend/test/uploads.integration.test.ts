import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { serve } from '@hono/node-server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, ListMultipartUploadsCommand, AbortMultipartUploadCommand } from '@aws-sdk/client-s3';
import { ApiError, FileItem, PART_SIZE, authRoutes, fileRoutes, uploadRoutes } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { auditLog, blobs, files, jobs, uploads, users, vaultMembers, vaults } from '../src/db/schema.ts';
import { createStorage } from '../src/storage.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('upload HTTP endpoints enforce ownership, integrity, recovery, dedup scope and ready-only downloads', {
  skip: databaseUrl && process.env.RUN_STORAGE_INTEGRATION === '1' ? false : 'Requires TEST_DATABASE_URL and RUN_STORAGE_INTEGRATION=1 with RustFS S3_*',
  timeout: 60000,
}, async (t) => {
  assert.ok(databaseUrl);
  assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/);
  const db = createDatabase(databaseUrl);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  const config = readConfig({ DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomUUID() + randomUUID() });
  const storage = createStorage();
  storage.bucket = `bpackz-test-${randomUUID()}`;
  await storage.client.send(new CreateBucketCommand({ Bucket: storage.bucket }));
  const app = createApp(config.webOrigin, createAuth(db, config), db, storage);
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const userIds: string[] = [];
  const request = (path: string, cookie = '', method = 'GET', input?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { Cookie: cookie, Origin: config.webOrigin, 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const expect = async (response: Response, status: number) => {
    const text = await response.text();
    assert.equal(response.status, status, text);
    const data = text ? JSON.parse(text) : null;
    if (status >= 400) ApiError.parse(data);
    return data;
  };
  const signup = async () => {
    const response = await request('/auth/sign-up/email', '', 'POST', { name: 'Upload test', email: `${randomUUID()}@example.com`, password: randomUUID() });
    const data = await expect(response, 200);
    userIds.push(data.user.id);
    const cookie = response.headers.getSetCookie().map((v) => v.split(';')[0]).join('; ');
    const me = authRoutes.me.response.parse(await expect(await request('/me', cookie), 200));
    return { cookie, userId: me.user.id, vaultId: me.personalVaultId };
  };
  const bytes = Buffer.from('trusted test bytes');
  const sha = createHash('sha256').update(bytes).digest('hex');
  try {
    const owner = await signup();
    const other = await signup();
    const root = `/vaults/${owner.vaultId}`;
    const input = (name: string, size = bytes.length, sha256 = sha) => ({ folderId: null, name, size, mime: 'application/octet-stream', sha256 });
    const begin = async (name: string, size = bytes.length, sha256 = sha, vaultId = owner.vaultId, cookie = owner.cookie) => {
      const created = uploadRoutes.create.response.parse(await expect(await request(`/vaults/${vaultId}/uploads`, cookie, 'POST', input(name, size, sha256)), 201));
      assert.equal(created.dedup, false);
      if (created.dedup) throw new Error('Expected new upload');
      assert.match(created.key, /^blobs\/[a-f0-9-]{36}$/);
      assert.ok(!created.key.includes(sha256));
      return created;
    };
    const put = async (started: Awaited<ReturnType<typeof begin>>, payloads: Buffer[], cookie = owner.cookie, vaultId = owner.vaultId) => {
      const signed = uploadRoutes.sign.response.parse(await expect(await request(`/vaults/${vaultId}/uploads/${started.uploadId}/sign`, cookie, 'POST', {
        key: started.key, partNumbers: payloads.map((_, i) => i + 1),
      }), 200));
      const parts = [];
      for (const [i, entry] of signed.urls.entries()) {
        const response = await fetch(entry.url, { method: 'PUT', body: payloads[i] });
        assert.equal(response.status, 200);
        const etag = response.headers.get('etag');
        assert.ok(etag);
        parts.push({ partNumber: entry.partNumber, etag });
      }
      return parts;
    };
    const completion = (started: Awaited<ReturnType<typeof begin>>, name: string, parts: { partNumber: number; etag: string }[], sha256 = sha) => ({
      key: started.key, folderId: null, name, mime: 'application/octet-stream', sha256, parts,
    });
    await t.test('sessions, editors, intent owner, vault, key, expiration and part bounds', async () => {
      await expect(await request(`${root}/uploads`, '', 'POST', input('anonymous')), 401);
      await expect(await request(`${root}/uploads`, other.cookie, 'POST', input('outside')), 403);
      await db.insert(vaultMembers).values({ vaultId: owner.vaultId, userId: other.userId, role: 'viewer' });
      await expect(await request(`${root}/uploads`, other.cookie, 'POST', input('viewer')), 403);
      const started = await begin('bounds');
      const signPath = `${root}/uploads/${started.uploadId}/sign`;
      await db.update(vaultMembers).set({ role: 'editor' }).where(and(eq(vaultMembers.vaultId, owner.vaultId), eq(vaultMembers.userId, other.userId)));
      await expect(await request(signPath, other.cookie, 'POST', { key: started.key, partNumbers: [1] }), 404);
      await expect(await request(`${root}/uploads/${started.uploadId}?key=${encodeURIComponent(started.key)}`, other.cookie, 'DELETE'), 404);
      await expect(await request(signPath, owner.cookie, 'POST', { key: 'foreign-key', partNumbers: [1] }), 400);
      await expect(await request(signPath, owner.cookie, 'POST', { key: started.key, partNumbers: [2] }), 400);
      await expect(await request(signPath, owner.cookie, 'POST', { key: started.key, partNumbers: [1, 1] }), 400);
      await db.update(uploads).set({ expiresAt: new Date(0) }).where(eq(uploads.id, started.uploadId));
      await expect(await request(signPath, owner.cookie, 'POST', { key: started.key, partNumbers: [1] }), 409);
      await expect(await request(`${root}/uploads/${started.uploadId}?key=${encodeURIComponent(started.key)}`, owner.cookie, 'DELETE'), 204);
      assert.equal((await db.select().from(uploads).where(eq(uploads.id, started.uploadId))).length, 0);
      await db.delete(vaultMembers).where(and(eq(vaultMembers.vaultId, owner.vaultId), eq(vaultMembers.userId, other.userId)));
    });

    let uploaded: FileItem;
    await t.test('completion recovery after S3 success/database rollback, idempotency, job and processing gates', async () => {
      const started = await begin('recover.bin');
      const parts = await put(started, [bytes]);
      const payload = completion(started, 'recover.bin', parts);
      const path = `${root}/uploads/${started.uploadId}/complete`;
      await expect(await request(path, owner.cookie, 'POST', { ...payload, sha256: 'a'.repeat(64) }), 400);
      await expect(await request(path, owner.cookie, 'POST', { ...payload, parts: [] }), 400);
      await expect(await request(path, owner.cookie, 'POST', { ...payload, parts: [{ partNumber: 1, etag: 'fake' }] }), 409);
      await db.execute(sql.raw(`ALTER TABLE audit_log ADD CONSTRAINT test_upload_rollback CHECK (target_id IS DISTINCT FROM '${started.uploadId}' OR action <> 'file.upload_complete')`));
      try {
        const failed = await request(path, owner.cookie, 'POST', payload);
        assert.equal(failed.status, 500);
        assert.equal(await failed.text(), 'Internal server error');
        assert.equal((await db.select().from(files).where(eq(files.id, started.uploadId))).length, 0);
        assert.equal((await db.select().from(jobs).where(eq(jobs.fileId, started.uploadId))).length, 0);
        assert.ok((await db.select().from(uploads).where(eq(uploads.id, started.uploadId)))[0].parts);
      } finally {
        await db.execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_upload_rollback`);
      }
      const responses = await Promise.all([request(path, owner.cookie, 'POST', payload), request(path, owner.cookie, 'POST', payload)]);
      uploaded = FileItem.parse(await expect(responses[0], 201));
      assert.equal(FileItem.parse(await expect(responses[1], 201)).id, uploaded.id);
      assert.equal(uploaded.status, 'processing');
      assert.equal(uploaded.sha256, null);
      assert.equal((await db.select().from(uploads).where(eq(uploads.id, uploaded.id))).length, 0);
      const [job] = await db.select().from(jobs).where(eq(jobs.fileId, uploaded.id));
      assert.equal(job.payload.claimedSha256, sha);
      assert.equal(job.state, 'queued');
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, uploaded.id)))[0].refCount, 1);
      assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.targetId, uploaded.id), eq(auditLog.action, 'file.upload_complete')))).length, 1);
      await expect(await request(path, owner.cookie, 'POST', { ...payload, name: 'different' }), 409);
      await expect(await request(`${root}/files/${uploaded.id}/download`, owner.cookie), 409);
      await expect(await request(`${root}/files/${uploaded.id}/waveform`, owner.cookie), 409);
      const unverified = await begin('not-dedup-unverified');
      await expect(await request(`${root}/uploads/${unverified.uploadId}?key=${encodeURIComponent(unverified.key)}`, owner.cookie, 'DELETE'), 204);
      // Fixture simulates a worker only after the test itself hashes the known uploaded bytes.
      await db.transaction(async (tx) => {
        await tx.update(blobs).set({ sha256: sha, verifiedAt: new Date() }).where(eq(blobs.id, uploaded.id));
        await tx.update(files).set({ status: 'ready' }).where(eq(files.id, uploaded.id));
      });
      const download = fileRoutes.downloadUrl.response.parse(await expect(await request(`${root}/files/${uploaded.id}/download`, owner.cookie), 200));
      assert.equal(new URL(download.url).searchParams.get('X-Amz-Expires'), '300');
      const response = await fetch(download.url);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
      await expect(await request(`${root}/files/${uploaded.id}/waveform`, owner.cookie), 404);
      await expect(await request(`${root}/files/${uploaded.id}/download`, other.cookie), 403);
      await db.update(files).set({ status: 'failed' }).where(eq(files.id, uploaded.id));
      await expect(await request(`${root}/files/${uploaded.id}/download`, owner.cookie), 409);
      await db.update(files).set({ status: 'ready' }).where(eq(files.id, uploaded.id));
    });

    await t.test('verified dedup needs source access and preserves trusted metadata', async () => {
      const privateAttempt = await begin('private-hash.bin', bytes.length, sha, other.vaultId, other.cookie);
      await expect(await request(`/vaults/${other.vaultId}/uploads/${privateAttempt.uploadId}?key=${encodeURIComponent(privateAttempt.key)}`, other.cookie, 'DELETE'), 204);
      const dedup = uploadRoutes.create.response.parse(await expect(await request(`${root}/uploads`, owner.cookie, 'POST', input('copy.bin')), 201));
      assert.equal(dedup.dedup, true);
      if (!dedup.dedup) throw new Error('Expected readable verified dedup');
      assert.equal(dedup.file.status, 'ready');
      assert.equal(dedup.file.sha256, sha);
      await expect(await request(`${root}/uploads`, owner.cookie, 'POST', input('copy.bin')), 409);
      await expect(await request(`${root}/uploads`, owner.cookie, 'POST', input('wrong-size.bin', bytes.length + 1)), 409);
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, uploaded.id)))[0].refCount, 2);
    });

    await t.test('multipart sizing, deleted destinations and successful two-part completion', async () => {
      const bad = await begin('wrong-size', bytes.length + 1, 'b'.repeat(64));
      const badParts = await put(bad, [bytes]);
      await expect(await request(`${root}/uploads/${bad.uploadId}/complete`, owner.cookie, 'POST', completion(bad, 'wrong-size', badParts, 'b'.repeat(64))), 409);
      await expect(await request(`${root}/uploads/${bad.uploadId}?key=${encodeURIComponent(bad.key)}`, owner.cookie, 'DELETE'), 204);
      const first = Buffer.alloc(PART_SIZE, 0x62);
      const hash = createHash('sha256').update(first).update(bytes).digest('hex');
      const multi = await begin('two-parts', PART_SIZE + bytes.length, hash);
      const parts = await put(multi, [first, bytes]);
      const done = FileItem.parse(await expect(await request(`${root}/uploads/${multi.uploadId}/complete`, owner.cookie, 'POST', completion(multi, 'two-parts', parts, hash)), 201));
      assert.equal(done.size, PART_SIZE + bytes.length);
      assert.equal(done.sha256, null);
      assert.equal(done.status, 'processing');
      const folder = await expect(await request(`${root}/folders`, owner.cookie, 'POST', { name: 'Destination', parentId: null }), 201);
      const started = uploadRoutes.create.response.parse(await expect(await request(`${root}/uploads`, owner.cookie, 'POST', { ...input('hidden', bytes.length, 'c'.repeat(64)), folderId: folder.id }), 201));
      if (started.dedup) throw new Error('Expected upload');
      await expect(await request(`${root}/folders/${folder.id}`, owner.cookie, 'DELETE'), 204);
      await expect(await request(`${root}/uploads/${started.uploadId}/sign`, owner.cookie, 'POST', { key: started.key, partNumbers: [1] }), 404);
      await expect(await request(`${root}/uploads/${started.uploadId}?key=${encodeURIComponent(started.key)}`, owner.cookie, 'DELETE'), 204);
    });
  } finally {
    try {
      const pending = await storage.client.send(new ListMultipartUploadsCommand({ Bucket: storage.bucket }));
      for (const upload of pending.Uploads ?? []) await storage.client.send(new AbortMultipartUploadCommand({ Bucket: storage.bucket, Key: upload.Key, UploadId: upload.UploadId }));
      const objects = await storage.client.send(new ListObjectsV2Command({ Bucket: storage.bucket }));
      if (objects.Contents?.length) await storage.client.send(new DeleteObjectsCommand({ Bucket: storage.bucket, Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key! })) } }));
      await storage.client.send(new DeleteBucketCommand({ Bucket: storage.bucket }));
      if (userIds.length) {
        const owned = await db.select({ id: files.blobId }).from(files).where(inArray(files.createdBy, userIds));
        await db.delete(vaults).where(inArray(vaults.createdBy, userIds));
        if (owned.length) await db.delete(blobs).where(inArray(blobs.id, owned.map((b) => b.id)));
        await db.delete(users).where(inArray(users.id, userIds));
      }
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await db.$client.end();
      storage.client.destroy();
    }
  }
});

