import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { serve } from '@hono/node-server';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateBucketCommand, CreateMultipartUploadCommand,
  DeleteBucketCommand, DeleteObjectsCommand, GetBucketCorsCommand, GetBucketLifecycleConfigurationCommand,
  HeadObjectCommand, ListMultipartUploadsCommand, ListObjectsV2Command, PutBucketLifecycleConfigurationCommand, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { FileItem, authRoutes, fileRoutes, uploadRoutes } from '@bpackz/shared';
import { createApp } from '../../backend/src/app.ts';
import { createAuth } from '../../backend/src/auth.ts';
import { readConfig } from '../../backend/src/config.ts';
import { createDatabase } from '../../backend/src/db/index.ts';
import { auditLog, blobs, files, jobs, uploads } from '../../backend/src/db/schema.ts';
import { createStorage } from '../../backend/src/storage.ts';
import { configureBucket } from '../../backend/src/storage-setup.ts';
import { expireOne, verifyOne } from '../src/verify.ts';
import { checkAudioTools, startAudio } from '../src/audio.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('verification worker with real HTTP, PostgreSQL and RustFS', {
  skip: databaseUrl && process.env.RUN_STORAGE_INTEGRATION === '1' ? false : 'Requires TEST_DATABASE_URL and RUN_STORAGE_INTEGRATION=1',
  timeout: 90000,
}, async (t) => {
  assert.ok(databaseUrl);
  checkAudioTools();
  assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/);
  const admin = createDatabase(databaseUrl);
  const databaseName = `bpackz_worker_${randomUUID().replaceAll('-', '')}_test`;
  await admin.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
  const isolatedUrl = new URL(databaseUrl);
  isolatedUrl.pathname = `/${databaseName}`;
  const db = createDatabase(isolatedUrl.toString());
  const storage = createStorage();
  storage.bucket = `bpackz-test-${randomUUID()}`;
  const Bucket = storage.bucket;
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../backend/drizzle', import.meta.url)) });
  await storage.client.send(new CreateBucketCommand({ Bucket }));
  const config = readConfig({ DATABASE_URL: isolatedUrl.toString(), BETTER_AUTH_SECRET: randomUUID() + randomUUID() });
  const app = createApp(config.webOrigin, createAuth(db, config), db, storage);
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const request = (path: string, cookie = '', method = 'GET', input?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { Cookie: cookie, Origin: config.webOrigin, 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const expect = async (response: Response, status: number) => {
    const text = await response.text();
    assert.equal(response.status, status, text);
    return text ? JSON.parse(text) : null;
  };
  const signup = async () => {
    const response = await request('/auth/sign-up/email', '', 'POST', { name: 'Worker test', email: `${randomUUID()}@example.com`, password: randomUUID(), inviteCode: 'dev' });
    await expect(response, 200);
    const cookie = response.headers.getSetCookie().map((v) => v.split(';')[0]).join('; ');
    const me = authRoutes.me.response.parse(await expect(await request('/me', cookie), 200));
    return { cookie, vaultId: me.personalVaultId };
  };
  const drain = async () => {
    for (let count = 0; count < 20; count++) if (!await verifyOne(db, storage)) return;
    assert.fail('Worker failed to drain bounded test queue');
  };
  const missing = async (Key: string) => assert.rejects(storage.client.send(new HeadObjectCommand({ Bucket, Key })), { name: 'NotFound' });
  const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const jobFor = async (id: string) => (await db.select().from(jobs).where(eq(jobs.fileId, id)))[0];
  const rowFor = async (id: string) => (await db.select().from(files).where(eq(files.id, id)))[0];
  try {
    const owner = await signup();
    const other = await signup();
    const upload = async (bytes: Buffer, claimed = sha(bytes), user = owner) => {
      const name = `${randomUUID()}.bin`;
      const root = `/vaults/${user.vaultId}`;
      const started = uploadRoutes.create.response.parse(await expect(await request(`${root}/uploads`, user.cookie, 'POST', {
        folderId: null, name, size: bytes.length, mime: 'application/octet-stream', sha256: claimed,
      }), 201));
      assert.equal(started.dedup, false);
      if (started.dedup) throw new Error('Expected actual upload');
      const signed = uploadRoutes.sign.response.parse(await expect(await request(`${root}/uploads/${started.uploadId}/sign`, user.cookie, 'POST', { key: started.key, partNumbers: [1] }), 200));
      const put = await fetch(signed.urls[0].url, { method: 'PUT', body: bytes });
      assert.equal(put.status, 200);
      const completion = { key: started.key, folderId: null, name, mime: 'application/octet-stream', sha256: claimed, parts: [{ partNumber: 1, etag: put.headers.get('etag')! }] };
      const completePath = `${root}/uploads/${started.uploadId}/complete`;
      const file = FileItem.parse(await expect(await request(completePath, user.cookie, 'POST', completion), 201));
      assert.equal(file.status, 'processing');
      return { id: file.id, key: started.key, root, completion, completePath, user };
    };
    const fixture = (format: string, frequency = 440) => {
      const encoded = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=44100:duration=1`,
        '-ac', '2', '-f', format, 'pipe:1'], { maxBuffer: 1024 * 1024, windowsHide: true });
      assert.equal(encoded.status, 0, encoded.stderr?.toString());
      return encoded.stdout;
    };

    await t.test('WAV, MP3 and FLAC produce private contract-shaped peaks from one S3 read, independent of claimed MIME', async () => {
      for (const format of ['wav', 'mp3', 'flac']) {
        const bytes = fixture(format);
        const item = await upload(bytes);
        const path = `${item.root}/files/${item.id}/waveform`;
        await expect(await request(path, owner.cookie), 409);
        let reads = 0;
        storage.client.middlewareStack.add((next, context) => async (args) => {
          if (context.commandName === 'GetObjectCommand') reads++;
          return next(args);
        }, { step: 'initialize', name: 'countAudioReads' });
        try { await drain(); } finally { storage.client.middlewareStack.remove('countAudioReads'); }
        assert.equal(reads, 1);
        const metadata = FileItem.parse(await expect(await request(`${item.root}/files/${item.id}`, owner.cookie), 200));
        assert.equal(metadata.status, 'ready');
        assert.equal(metadata.hasWaveform, true);
        assert.ok(metadata.durationMs && Math.abs(metadata.durationMs - 1000) < 100);
        const waveform = fileRoutes.waveform.response.parse(await expect(await request(path, owner.cookie), 200));
        assert.equal(waveform.sampleRate, 8000);
        assert.equal(waveform.samplesPerPixel, 256);
        assert.equal(waveform.data.length, waveform.length * 2);
        assert.ok(waveform.data.some((value) => value > 0));
        assert.ok(waveform.data.some((value) => value < 0));
        await expect(await request(path, other.cookie), 403);
        await expect(await request(path), 401);
        const download = fileRoutes.downloadUrl.response.parse(await expect(await request(`${item.root}/files/${item.id}/download`, owner.cookie), 200));
        assert.deepEqual(Buffer.from(await (await fetch(download.url)).arrayBuffer()), bytes);
        const receipt = await expect(await request(item.completePath, owner.cookie, 'POST', item.completion), 201);
        assert.equal(receipt.hasWaveform, true);
        await expect(await request(`${item.root}/files/${item.id}`, owner.cookie, 'DELETE'), 204);
        await expect(await request(path, owner.cookie), 404);
      }
    });

    await t.test('audio metadata rolls back with verification, then same receipt retries without duplicate references', async () => {
      const item = await upload(fixture('wav', 660));
      await db.execute(sql.raw(`ALTER TABLE audit_log ADD CONSTRAINT test_audio_rollback CHECK (target_id IS DISTINCT FROM '${item.id}' OR action <> 'file.verified')`));
      try { await assert.rejects(verifyOne(db, storage)); }
      finally { await db.execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_audio_rollback`); }
      const blob = (await db.select().from(blobs).where(eq(blobs.id, item.id)))[0];
      assert.equal(blob.waveform, null);
      assert.equal(blob.verifiedAt, null);
      await db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.fileId, item.id));
      await drain();
      const before = await jobFor(item.id);
      await db.update(jobs).set({ state: 'queued', runAfter: new Date(0) }).where(eq(jobs.id, before.id));
      await drain();
      const after = (await db.select().from(blobs).where(eq(blobs.id, item.id)))[0];
      assert.ok(after.waveform);
      assert.equal(after.refCount, 1);
      assert.equal((await jobFor(item.id)).payload.uploadRequestHash, before.payload.uploadRequestHash);
    });

    await t.test('audio tool failure leaves verified file downloadable and retries its existing job', async () => {
      const item = await upload(fixture('wav', 880));
      const path = process.env.PATH;
      process.env.PATH = '';
      try { await verifyOne(db, storage); } finally { process.env.PATH = path; }
      assert.equal((await rowFor(item.id)).status, 'ready');
      const pending = await jobFor(item.id);
      assert.equal(pending.state, 'queued');
      assert.equal(pending.lastError, 'audio_analysis_failed');
      await expect(await request(`${item.root}/files/${item.id}/download`, owner.cookie), 200);
      await db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.id, pending.id));
      await drain();
      assert.equal((await jobFor(item.id)).id, pending.id);
      assert.equal((await jobFor(item.id)).lastError, null);
      assert.equal((await jobFor(item.id)).state, 'done');
      await expect(await request(`${item.root}/files/${item.id}/waveform`, owner.cookie), 200);
    });

    await t.test('recognized image stays ready without a waveform; repeated tool failures stop after three attempts', async () => {
      const image = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=16x16',
        '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1'], { windowsHide: true });
      assert.equal(image.status, 0, image.stderr?.toString());
      const picture = await upload(image.stdout);
      await drain();
      assert.equal((await rowFor(picture.id)).status, 'ready');
      await expect(await request(`${picture.root}/files/${picture.id}/waveform`, owner.cookie), 404);
      const item = await upload(fixture('wav', 770));
      const path = process.env.PATH;
      process.env.PATH = '';
      try {
        for (let i = 0; i < 3; i++) {
          await db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.fileId, item.id));
          await verifyOne(db, storage);
        }
      } finally { process.env.PATH = path; }
      const job = await jobFor(item.id);
      assert.equal(job.state, 'done');
      assert.equal(job.payload.audioAttempts, 3);
      assert.equal(job.lastError, 'audio_analysis_failed');
      assert.equal((await rowFor(item.id)).status, 'ready');
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, item.id)))[0].refCount, 1);
    });

    await t.test('audio with a false hash never publishes peaks, and cancellation stops processing', async () => {
      const item = await upload(fixture('wav', 990), 'e'.repeat(64));
      await drain();
      assert.equal((await rowFor(item.id)).status, 'failed');
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, item.id)))[0].waveform, null);
      await expect(await request(`${item.root}/files/${item.id}/waveform`, owner.cookie), 409);
      const stop = new AbortController();
      const audio = startAudio(stop.signal);
      stop.abort();
      await assert.rejects(audio.finish(), { name: 'AbortError' });
    });

    await t.test('concurrent verified audio dedup preserves canonical peaks and reference counts', async () => {
      const bytes = fixture('flac', 1100);
      const a = await upload(bytes);
      const b = await upload(bytes, sha(bytes), other);
      await Promise.all([verifyOne(db, storage), verifyOne(db, storage)]);
      await drain();
      const first = await rowFor(a.id);
      assert.equal(first.blobId, (await rowFor(b.id)).blobId);
      const blob = (await db.select().from(blobs).where(eq(blobs.id, first.blobId)))[0];
      assert.equal(blob.refCount, 2);
      const left = await expect(await request(`${a.root}/files/${a.id}/waveform`, owner.cookie), 200);
      const right = await expect(await request(`${b.root}/files/${b.id}/waveform`, other.cookie), 200);
      assert.deepEqual(left, right);
      assert.deepEqual(left, blob.waveform);
    });

    await t.test('bucket setup preserves existing lifecycle rules and installs one-day multipart cleanup', async () => {
      await storage.client.send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [
        { ID: 'other-owner', Status: 'Enabled', Filter: { Prefix: 'other/' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } },
      ] } }));
      await configureBucket(storage, config.webOrigin);
      await configureBucket(storage, config.webOrigin);
      const { Rules } = await storage.client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }));
      assert.equal(Rules?.length, 2);
      assert.equal(Rules?.find((r) => r.ID === 'other-owner')?.AbortIncompleteMultipartUpload?.DaysAfterInitiation, 7);
      assert.equal(Rules?.find((r) => r.ID === 'bpackz-incomplete-uploads')?.AbortIncompleteMultipartUpload?.DaysAfterInitiation, 1);
      assert.ok((await storage.client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules?.some((r) => r.ID === 'bpackz-web'));
    });

    await t.test('upload becomes ready, signed download returns exact bytes, completion receipt survives', async () => {
      const bytes = Buffer.from(`success-${randomUUID()}`);
      const item = await upload(bytes);
      await expect(await request(`${item.root}/files/${item.id}/download`, owner.cookie), 409);
      assert.equal(await verifyOne(db, storage), true);
      const ready = FileItem.parse(await expect(await request(`${item.root}/files/${item.id}`, owner.cookie), 200));
      assert.equal(ready.status, 'ready');
      assert.equal(ready.sha256, sha(bytes));
      assert.equal(ready.hasWaveform, false);
      assert.equal(ready.durationMs, null);
      await expect(await request(`${item.root}/files/${item.id}/waveform`, owner.cookie), 404);
      const download = fileRoutes.downloadUrl.response.parse(await expect(await request(`${item.root}/files/${item.id}/download`, owner.cookie), 200));
      assert.deepEqual(Buffer.from(await (await fetch(download.url)).arrayBuffer()), bytes);
      assert.equal((await jobFor(item.id)).state, 'done');
      assert.equal((await expect(await request(item.completePath, owner.cookie, 'POST', item.completion), 201)).id, item.id);
      const before = await jobFor(item.id);
      await db.update(jobs).set({ state: 'queued', runAfter: new Date(0) }).where(eq(jobs.id, before.id));
      await drain();
      assert.equal((await jobFor(item.id)).id, before.id);
      assert.equal((await jobFor(item.id)).payload.uploadRequestHash, before.payload.uploadRequestHash);
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, item.id)))[0].refCount, 1);
    });

    await t.test('bad hash and missing object fail privately; cleanup recovers after delete succeeds and DB rolls back', async () => {
      const item = await upload(Buffer.from('bad bytes'), 'a'.repeat(64));
      await verifyOne(db, storage);
      assert.equal((await rowFor(item.id)).status, 'failed');
      const job = await jobFor(item.id);
      assert.ok(job.payload.cleanup);
      await db.execute(sql.raw(`ALTER TABLE audit_log ADD CONSTRAINT test_cleanup_rollback CHECK (target_id IS DISTINCT FROM '${job.id}' OR action <> 'job.verify_cleanup')`));
      try { await assert.rejects(verifyOne(db, storage)); }
      finally { await db.execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_cleanup_rollback`); }
      await missing(item.key);
      assert.ok((await jobFor(item.id)).payload.cleanup);
      await db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.id, job.id));
      await drain();
      assert.equal((await jobFor(item.id)).state, 'failed');
      assert.equal((await jobFor(item.id)).lastError, 'hash_mismatch');
      await expect(await request(`${item.root}/files/${item.id}/download`, owner.cookie), 409);
      const absent = await upload(Buffer.from(`missing-${randomUUID()}`));
      await storage.client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: [{ Key: absent.key }] } }));
      await drain();
      assert.equal((await rowFor(absent.id)).status, 'failed');
      assert.equal((await jobFor(absent.id)).lastError, 'object_missing');
    });

    await t.test('concurrent same-hash uploads dedup only after possession, with one canonical blob and no duplicate refs', async () => {
      const bytes = Buffer.from(`same-${randomUUID()}`);
      const a = await upload(bytes);
      const b = await upload(bytes, sha(bytes), other);
      await Promise.all([verifyOne(db, storage), verifyOne(db, storage)]);
      await drain();
      const first = await rowFor(a.id);
      const second = await rowFor(b.id);
      assert.equal(first.status, 'ready');
      assert.equal(second.status, 'ready');
      assert.equal(first.blobId, second.blobId);
      const canonical = (await db.select().from(blobs).where(eq(blobs.id, first.blobId)))[0];
      assert.equal(canonical.refCount, 2);
      const duplicate = first.blobId === a.id ? b : a;
      await missing(duplicate.key);
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, duplicate.id)))[0].refCount, 0);
      assert.equal((await jobFor(a.id)).state, 'done');
      assert.equal((await jobFor(b.id)).state, 'done');
      await drain();
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, canonical.id)))[0].refCount, 2);
    });

    await t.test('audit rollback leaves bytes and processing state intact, retry then succeeds', async () => {
      const item = await upload(Buffer.from(`rollback-${randomUUID()}`));
      await db.execute(sql.raw(`ALTER TABLE audit_log ADD CONSTRAINT test_verify_rollback CHECK (target_id IS DISTINCT FROM '${item.id}' OR action <> 'file.verified')`));
      try { await assert.rejects(verifyOne(db, storage)); }
      finally { await db.execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_verify_rollback`); }
      assert.equal((await rowFor(item.id)).status, 'processing');
      assert.equal((await jobFor(item.id)).state, 'queued');
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, item.id)))[0].sha256, null);
      await storage.client.send(new HeadObjectCommand({ Bucket, Key: item.key }));
      await db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.fileId, item.id));
      await drain();
      assert.equal((await rowFor(item.id)).status, 'ready');
      assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.targetId, item.id), eq(auditLog.action, 'file.verified')))).length, 1);
    });

    await t.test('transient S3 failure backs off the existing job without exposing bytes or credentials', async () => {
      const item = await upload(Buffer.from(`retry-${randomUUID()}`));
      storage.client.middlewareStack.add((next, context) => async (args) => {
        if (context.commandName === 'GetObjectCommand') throw new Error('simulated private storage details');
        return next(args);
      }, { step: 'initialize', name: 'failRead' });
      try { await verifyOne(db, storage); } finally { storage.client.middlewareStack.remove('failRead'); }
      const job = await jobFor(item.id);
      assert.equal(job.state, 'queued');
      assert.equal(job.attempts, 1);
      assert.equal(job.lastError, 'storage_read_failed');
      assert.ok(job.runAfter.getTime() > Date.now());
      assert.equal(await verifyOne(db, storage), false);
      await db.update(jobs).set({ runAfter: new Date(0) }).where(eq(jobs.id, job.id));
      await drain();
      assert.equal((await rowFor(item.id)).status, 'ready');
      assert.equal((await jobFor(item.id)).id, job.id);
    });

    await t.test('killed worker releases its job claim and restart verifies the same row', async () => {
      const item = await upload(Buffer.from(`crash-${randomUUID()}`));
      const original = await jobFor(item.id);
      const script = `
        import { createDatabase } from ${JSON.stringify(new URL('../../backend/src/db/index.ts', import.meta.url).href)};
        import { createStorage } from ${JSON.stringify(new URL('../../backend/src/storage.ts', import.meta.url).href)};
        import { verifyOne } from ${JSON.stringify(new URL('../src/verify.ts', import.meta.url).href)};
        const db = createDatabase(process.env.DATABASE_URL);
        const storage = createStorage();
        storage.client.middlewareStack.add((next, context) => async (args) => {
          const result = await next(args);
          if (context.commandName === 'GetObjectCommand') {
            process.send('streaming');
            await new Promise(() => {});
          }
          return result;
        }, { step: 'initialize', name: 'crashBarrier' });
        await verifyOne(db, storage);
      `;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, DATABASE_URL: isolatedUrl.toString(), S3_BUCKET: Bucket },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      const exited = once(child, 'exit');
      try {
        const [message] = await Promise.race([
          once(child, 'message'),
          exited.then(() => { throw new Error('Crash-test child exited before acquiring its claim'); }),
        ]);
        assert.equal(message, 'streaming');
        assert.equal(await verifyOne(db, storage), false);
      } finally { child.kill('SIGKILL'); await exited; }
      await drain();
      assert.equal((await rowFor(item.id)).status, 'ready');
      assert.equal((await jobFor(item.id)).id, original.id);
      assert.equal((await jobFor(item.id)).attempts, 1);
    });

    await t.test('job lock prevents duplicate streaming, while move/trash during the stream is preserved', async () => {
      const item = await upload(Buffer.from(`moved-${randomUUID()}`));
      const shared = await expect(await request('/vaults', owner.cookie, 'POST', { name: 'Move destination' }), 201);
      let entered!: () => void;
      let release!: () => void;
      const reading = new Promise<void>((resolve) => { entered = resolve; });
      const resume = new Promise<void>((resolve) => { release = resolve; });
      storage.client.middlewareStack.add((next, context) => async (args) => {
        const result = await next(args);
        if (context.commandName === 'GetObjectCommand') { entered(); await resume; }
        return result;
      }, { step: 'initialize', name: 'pauseRead' });
      const running = verifyOne(db, storage);
      try {
        await reading;
        assert.equal(await verifyOne(db, storage), false);
        const current = FileItem.parse(await expect(await request(`${item.root}/files/${item.id}`, owner.cookie), 200));
        await expect(await request(`${item.root}/files/${item.id}`, owner.cookie, 'PATCH', {
          toVaultId: shared.id, folderId: null, ifUpdatedAt: current.updatedAt,
        }), 200);
        await expect(await request(`/vaults/${shared.id}/files/${item.id}`, owner.cookie, 'DELETE'), 204);
      } finally { release(); storage.client.middlewareStack.remove('pauseRead'); }
      await running;
      const row = await rowFor(item.id);
      assert.equal(row.vaultId, shared.id);
      assert.ok(row.deletedAt);
      assert.equal(row.status, 'ready');
      await expect(await request(`/vaults/${shared.id}/files/${item.id}/download`, owner.cookie), 404);
    });

    await t.test('expired intents abort multipart or clean a completed prepared object, preserving live intents', async () => {
      const makeIntent = async (expired: boolean, prepared: boolean) => {
        const id = randomUUID();
        const key = `blobs/${id}`;
        const { UploadId } = await storage.client.send(new CreateMultipartUploadCommand({ Bucket, Key: key }));
        assert.ok(UploadId);
        let parts = null;
        if (prepared) {
          const part = await storage.client.send(new UploadPartCommand({ Bucket, Key: key, UploadId, PartNumber: 1, Body: Buffer.from('a') }));
          parts = [{ PartNumber: 1, ETag: part.ETag! }];
          await storage.client.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId, MultipartUpload: { Parts: parts } }));
        }
        const [user] = await db.select().from(files).where(eq(files.vaultId, owner.vaultId));
        await db.insert(uploads).values({ id, key, userId: user.createdBy!, vaultId: owner.vaultId, name: id, size: 1,
          claimedSha256: 'b'.repeat(64), multipartId: UploadId, parts, expiresAt: expired ? new Date(0) : new Date(Date.now() + 60000) });
        return { id, key, uploadId: UploadId };
      };
      const old = await makeIntent(true, false);
      const prepared = await makeIntent(true, true);
      const live = await makeIntent(false, false);
      assert.equal(await expireOne(db, storage), true);
      assert.equal(await expireOne(db, storage), true);
      assert.equal(await expireOne(db, storage), false);
      assert.equal((await db.select().from(uploads)).length, 1);
      assert.equal((await db.select().from(uploads))[0].id, live.id);
      const pending = (await storage.client.send(new ListMultipartUploadsCommand({ Bucket }))).Uploads ?? [];
      assert.ok(!pending.some((u) => u.UploadId === old.uploadId));
      assert.ok(pending.some((u) => u.UploadId === live.uploadId));
      await missing(prepared.key);
    });

    const start = performance.now();
    for (let i = 0; i < 10; i++) { assert.equal(await verifyOne(db, storage), false); assert.equal(await expireOne(db, storage), false); }
    t.diagnostic(`Idle database microbenchmark: ${((performance.now() - start) / 10).toFixed(2)} ms per empty poll pair; production sleeps 5 s between empty polls.`);
  } finally {
    try {
      const pending = await storage.client.send(new ListMultipartUploadsCommand({ Bucket }));
      for (const item of pending.Uploads ?? []) await storage.client.send(new AbortMultipartUploadCommand({ Bucket, Key: item.Key, UploadId: item.UploadId }));
      const objects = await storage.client.send(new ListObjectsV2Command({ Bucket }));
      if (objects.Contents?.length) await storage.client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key! })) } }));
      await storage.client.send(new DeleteBucketCommand({ Bucket }));
    } finally {
      storage.client.destroy();
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await db.$client.end();
      await admin.execute(sql.raw(`DROP DATABASE "${databaseName}"`));
      await admin.$client.end();
    }
  }
});
