import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { createDatabase } from '../../backend/src/db/index.ts';
import { auditLog, blobs, files, folders, jobs, shares, users, vaultMembers, vaults } from '../../backend/src/db/schema.ts';
import { createStorage } from '../../backend/src/storage.ts';
import { purgeOne } from '../src/purge.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('30-day purge, blob ownership and crash recovery on PostgreSQL/RustFS', {
  skip: databaseUrl && process.env.RUN_STORAGE_INTEGRATION === '1' ? false : 'Requires TEST_DATABASE_URL and RUN_STORAGE_INTEGRATION=1',
  timeout: 30000,
}, async (t) => {
  assert.ok(databaseUrl); assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/);
  const admin = createDatabase(databaseUrl);
  const databaseName = `bpackz_purge_${randomUUID().replaceAll('-', '')}_test`;
  await admin.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
  const isolated = new URL(databaseUrl); isolated.pathname = `/${databaseName}`;
  const db = createDatabase(isolated.toString()), storage = createStorage();
  storage.bucket = `bpackz-test-${randomUUID()}`; const Bucket = storage.bucket;
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../backend/drizzle', import.meta.url)) });
  await storage.client.send(new CreateBucketCommand({ Bucket }));
  const old = new Date(Date.now() - 31 * 86_400_000);
  const userId = randomUUID(), vaultId = randomUUID();
  await db.insert(users).values({ id: userId, email: `${userId}@example.com`, name: 'Purge test' });
  await db.insert(vaults).values({ id: vaultId, kind: 'shared', name: 'Purge', createdBy: userId });
  await db.insert(vaultMembers).values({ vaultId, userId, role: 'owner' });
  const object = async (refCount: number) => {
    const id = randomUUID(), key = `blobs/${id}`;
    await storage.client.send(new PutObjectCommand({ Bucket, Key: key, Body: 'original' }));
    await db.insert(blobs).values({ id, s3Key: key, size: 8, refCount });
    return { id, key };
  };
  const seedFile = async (blobId: string, deletedAt: Date | null, folderId: string | null = null) => {
    const id = randomUUID();
    await db.insert(files).values({ id, vaultId, blobId, folderId, deletedAt, name: id, createdBy: userId });
    return id;
  };
  const drain = async () => { for (let i = 0; i < 30; i++) if (!await purgeOne(db, storage)) return; assert.fail('Purge did not drain'); };
  const missing = async (key: string) => assert.rejects(storage.client.send(new HeadObjectCommand({ Bucket, Key: key })), { name: 'NotFound' });
  try {
    await t.test('only old trash loses references; live and recent copies preserve shared bytes', async () => {
      const blob = await object(3);
      const expired = await seedFile(blob.id, old), recent = await seedFile(blob.id, new Date()), live = await seedFile(blob.id, null);
      await db.insert(jobs).values({ kind: 'verify', fileId: expired, state: 'done', payload: { claimedSha256: 'a'.repeat(64), uploadRequestHash: 'b'.repeat(64) } });
      await db.insert(shares).values({ id: randomUUID(), fileId: expired, tokenHash: 'c'.repeat(64), role: 'view', createdBy: userId });
      assert.equal(await purgeOne(db, storage), true);
      assert.equal((await db.select().from(files).where(eq(files.id, expired))).length, 0);
      assert.equal((await db.select().from(jobs).where(eq(jobs.fileId, expired))).length, 0);
      assert.equal((await db.select().from(shares).where(eq(shares.fileId, expired))).length, 0);
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, blob.id)))[0].refCount, 2);
      await storage.client.send(new HeadObjectCommand({ Bucket, Key: blob.key }));
      assert.equal(await purgeOne(db, storage), false);
      await db.update(files).set({ deletedAt: old }).where(sql`${files.id} in (${recent}, ${live})`);
      await drain(); await missing(blob.key);
    });
    await t.test('folder cleanup is leaf-first and preserves any active/recent descendant', async () => {
      const parent = randomUUID(), child = randomUUID();
      await db.insert(folders).values({ id: parent, vaultId, name: parent, deletedAt: old });
      await db.insert(folders).values({ id: child, vaultId, parentId: parent, name: child, deletedAt: new Date() });
      const blob = await object(1), live = await seedFile(blob.id, null, child);
      assert.equal(await purgeOne(db, storage), false);
      await db.update(folders).set({ deletedAt: old }).where(eq(folders.id, child));
      assert.equal(await purgeOne(db, storage), false);
      await db.update(files).set({ deletedAt: old }).where(eq(files.id, live));
      await drain(); await missing(blob.key);
      assert.equal((await db.select().from(folders)).length, 0);
    });
    await t.test('storage error retains orphan; SQL failure after S3 delete retries idempotently', async () => {
      const blob = await object(0);
      storage.client.middlewareStack.add(() => async () => { throw new Error('Storage unavailable'); }, { step: 'initialize', name: 'purgeStorageFailure' });
      try { await assert.rejects(purgeOne(db, storage)); }
      finally { storage.client.middlewareStack.remove('purgeStorageFailure'); }
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, blob.id))).length, 1);
      await db.execute(sql`CREATE FUNCTION reject_purge_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'blob.purge' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END $$`);
      await db.execute(sql`CREATE TRIGGER reject_purge_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_purge_audit()`);
      try { await assert.rejects(purgeOne(db, storage)); }
      finally { await db.execute(sql`DROP TRIGGER reject_purge_audit ON audit_log`); await db.execute(sql`DROP FUNCTION reject_purge_audit()`); }
      await missing(blob.key);
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, blob.id))).length, 1);
      assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.targetId, blob.id), eq(auditLog.action, 'blob.purge')))).length, 0);
      assert.equal(await purgeOne(db, storage), true);
      assert.equal((await db.select().from(blobs).where(eq(blobs.id, blob.id))).length, 0);
    });
    await t.test('active verification job is skipped without deadlock; parallel purgers release once', async () => {
      const blob = await object(1), id = await seedFile(blob.id, old);
      await db.insert(jobs).values({ kind: 'verify', fileId: id, payload: { claimedSha256: 'a'.repeat(64), uploadRequestHash: 'b'.repeat(64) } });
      let release!: () => void, locked!: () => void;
      const ready = new Promise<void>((resolve) => { locked = resolve; });
      const held = new Promise<void>((resolve) => { release = resolve; });
      const active = db.transaction(async (tx) => { await tx.select().from(jobs).where(eq(jobs.fileId, id)).for('update'); locked(); await held; });
      await ready;
      try { assert.equal(await purgeOne(db, storage), false); }
      finally { release(); await active; }
      await Promise.all([purgeOne(db, storage), purgeOne(db, storage)]);
      await drain(); await missing(blob.key);
      assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.action, 'file.purge'), eq(auditLog.targetId, id)))).length, 1);
    });
    await t.test('orphan row lock protects concurrent references; abort leaves retry state intact', async () => {
      const blob = await object(0);
      const stop = new AbortController(); stop.abort();
      await assert.rejects(purgeOne(db, storage, stop.signal));
      await storage.client.send(new HeadObjectCommand({ Bucket, Key: blob.key }));
      // Simulate the same row lock used by dedup, then attach a live reference before releasing it.
      let release!: () => void, locked!: () => void;
      const ready = new Promise<void>((resolve) => { locked = resolve; });
      const held = new Promise<void>((resolve) => { release = resolve; });
      const attaching = db.transaction(async (tx) => {
        await tx.select().from(blobs).where(eq(blobs.id, blob.id)).for('update'); locked(); await held;
        await tx.insert(files).values({ id: randomUUID(), vaultId, blobId: blob.id, name: randomUUID(), createdBy: userId });
        await tx.update(blobs).set({ refCount: 1 }).where(eq(blobs.id, blob.id));
      });
      await ready;
      try { assert.equal(await purgeOne(db, storage), false); }
      finally { release(); await attaching; }
      assert.equal(await purgeOne(db, storage), false);
      await storage.client.send(new HeadObjectCommand({ Bucket, Key: blob.key }));
      await db.update(files).set({ deletedAt: old }).where(eq(files.blobId, blob.id)); await drain();
    });
    const started = performance.now();
    for (let i = 0; i < 10; i++) assert.equal(await purgeOne(db, storage), false);
    t.diagnostic(`Empty purge microbenchmark: ${((performance.now() - started) / 10).toFixed(2)} ms; idle purge runs at most once/minute (three SELECTs + BEGIN/COMMIT).`);
  } finally {
    try {
      const objects = await storage.client.send(new ListObjectsV2Command({ Bucket }));
      if (objects.Contents?.length) await storage.client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key! })) } }));
      await storage.client.send(new DeleteBucketCommand({ Bucket }));
    } finally {
      storage.client.destroy(); await db.$client.end(); await admin.execute(sql.raw(`DROP DATABASE "${databaseName}"`)); await admin.$client.end();
    }
  }
});
