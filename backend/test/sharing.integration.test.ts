import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { and, eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { ApiError, FileItem, authRoutes, fileRoutes, shareRoutes, vaultRoutes } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { auditLog, blobs, files, shares, users, vaultMembers } from '../src/db/schema.ts';
import { createStorage } from '../src/storage.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('HTTP membership and share capabilities with PostgreSQL/RustFS', {
  skip: databaseUrl && process.env.RUN_STORAGE_INTEGRATION === '1' ? false : 'Requires TEST_DATABASE_URL and RUN_STORAGE_INTEGRATION=1',
  timeout: 60000,
}, async (t) => {
  assert.ok(databaseUrl);
  assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/);
  const admin = createDatabase(databaseUrl);
  const databaseName = `bpackz_sharing_${randomUUID().replaceAll('-', '')}_test`;
  await admin.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
  const isolated = new URL(databaseUrl); isolated.pathname = `/${databaseName}`;
  const db = createDatabase(isolated.toString());
  const storage = createStorage();
  storage.bucket = `bpackz-test-${randomUUID()}`;
  const Bucket = storage.bucket;
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  await storage.client.send(new CreateBucketCommand({ Bucket }));
  const config = readConfig({ DATABASE_URL: isolated.toString(), BETTER_AUTH_SECRET: randomUUID() + randomUUID() });
  const server = serve({ fetch: createApp(config.webOrigin, createAuth(db, config), db, storage).fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const request = (path: string, cookie = '', method = 'GET', input?: unknown, origin = config.webOrigin) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const expect = async (response: Response, status: number) => {
    const text = await response.text(); assert.equal(response.status, status, text);
    const data = text ? JSON.parse(text) : null;
    if (status >= 400) ApiError.parse(data);
    return data;
  };
  const signup = async () => {
    const email = `${randomUUID()}@example.com`;
    const response = await request('/auth/sign-up/email', '', 'POST', { name: 'Share test', email, password: randomUUID(), inviteCode: 'dev' });
    await expect(response, 200);
    const cookie = response.headers.getSetCookie().map((v) => v.split(';')[0]).join('; ');
    const me = authRoutes.me.response.parse(await expect(await request('/me', cookie), 200));
    return { id: me.user.id, vaultId: me.personalVaultId, email, cookie };
  };
  try {
    const owner = await signup(), editor = await signup(), viewer = await signup(), outsider = await signup();
    const vault = vaultRoutes.create.response.parse(await expect(await request('/vaults', owner.cookie, 'POST', { name: 'Sharing' }), 201));
    const root = `/vaults/${vault.id}`;
    await t.test('existing-user invites, roles, origin protection and private personal vault', async () => {
      await expect(await request(`${root}/members`), 401);
      await expect(await request(`${root}/members`, outsider.cookie), 403);
      await expect(await request(`${root}/members`, owner.cookie, 'POST', { email: editor.email, role: 'owner' }), 400);
      await expect(await request(`${root}/members`, owner.cookie, 'POST', { email: editor.email, role: 'editor' }, 'https://bad.example'), 403);
      const invited = vaultRoutes.invite.response.parse(await expect(await request(`${root}/members`, owner.cookie, 'POST', { email: editor.email.toUpperCase(), role: 'editor' }), 201));
      assert.equal(invited.userId, editor.id);
      await expect(await request(`${root}/members`, owner.cookie, 'POST', { email: editor.email, role: 'viewer' }), 409);
      await expect(await request(`${root}/members`, editor.cookie, 'POST', { email: viewer.email, role: 'viewer' }), 403);
      await expect(await request(`${root}/members`, owner.cookie, 'POST', { email: 'missing@example.com', role: 'viewer' }), 404);
      await expect(await request(`${root}/members`, owner.cookie, 'POST', { email: viewer.email, role: 'viewer' }), 201);
      const list = vaultRoutes.members.response.parse(await expect(await request(`${root}/members`, viewer.cookie), 200));
      assert.equal(list.items.length, 3);
      await expect(await request(`/vaults/${owner.vaultId}/members`, owner.cookie, 'POST', { email: outsider.email, role: 'editor' }), 403);
      await expect(await request(`${root}/members/${owner.id}`, owner.cookie, 'DELETE'), 409);
    });
    const bytes = Buffer.from('share original bytes');
    const blobId = randomUUID(), fileId = randomUUID();
    await storage.client.send(new PutObjectCommand({ Bucket, Key: `blobs/${blobId}`, Body: bytes }));
    await db.insert(blobs).values({ id: blobId, sha256: createHash('sha256').update(bytes).digest('hex'), verifiedAt: new Date(),
      s3Key: `blobs/${blobId}`, size: bytes.length, refCount: 1,
      waveform: { sampleRate: 8000, samplesPerPixel: 256, bits: 8, length: 1, data: [-1, 1] } });
    await db.insert(files).values({ id: fileId, vaultId: vault.id, name: 'Private.wav', blobId, status: 'ready', createdBy: editor.id });
    const path = `${root}/files/${fileId}`;
    const createLink = async () => shareRoutes.create.response.parse(await expect(await request(`${path}/shares`, editor.cookie, 'POST', {}), 201));
    await t.test('public link returns token once, stores hash only, serves original bytes and scoped waveform', async () => {
      await expect(await request(`${path}/shares`, viewer.cookie, 'POST', {}), 403);
      await expect(await request(`${path}/shares`, editor.cookie, 'POST', { role: 'edit' }), 400);
      const link = await createLink(); assert.ok(link.url);
      const token = new URL(link.url).pathname.split('/').pop()!;
      assert.equal(Buffer.from(token, 'base64url').length, 32);
      const [saved] = await db.select().from(shares).where(eq(shares.id, link.id));
      assert.equal(saved.tokenHash, createHash('sha256').update(token).digest('hex'));
      assert.ok(!JSON.stringify(saved).includes(token));
      const listing = shareRoutes.list.response.parse(await expect(await request(`${path}/shares`, viewer.cookie), 200));
      assert.ok(!JSON.stringify(listing).includes(token)); assert.equal(listing.items[0].url, undefined);
      const landing = shareRoutes.resolve.response.parse(await expect(await request(`/s/${token}`), 200));
      assert.equal(landing.file.id, fileId);
      await expect(await request(`${path}/download`), 401);
      const download = fileRoutes.downloadUrl.response.parse(await expect(await request(`${path}/download?token=${token}`), 200));
      assert.equal(new URL(download.url).searchParams.get('X-Amz-Expires'), '300');
      assert.deepEqual(Buffer.from(await (await fetch(download.url)).arrayBuffer()), bytes);
      fileRoutes.waveform.response.parse(await expect(await request(`${path}/waveform?token=${token}`), 200));
      await expect(await request(`${path}?token=${token}`), 401);
      await expect(await request(`/vaults/${owner.vaultId}/files/${fileId}/download?token=${token}`), 404);
      await expect(await request(`${root}/files/${randomUUID()}/download?token=${token}`), 404);
      await expect(await request(`${path}/download?token=${'z'.repeat(43)}`), 404);
      await db.update(shares).set({ expiresAt: new Date(Date.now() + 12_000) }).where(eq(shares.id, link.id));
      const capped = fileRoutes.downloadUrl.response.parse(await expect(await request(`${path}/download?token=${token}`), 200));
      assert.ok(Number(new URL(capped.url).searchParams.get('X-Amz-Expires')) <= 12);
      await expect(await request(`${path}/shares/${link.id}`, outsider.cookie, 'DELETE'), 403);
      await expect(await request(`${path}/shares/${link.id}`, editor.cookie, 'DELETE'), 204);
      await expect(await request(`/s/${token}`), 404);
      await expect(await request(`${path}/waveform?token=${token}`), 404);
    });
    await t.test('direct edit grant affects only its file; no vault, upload or move authority', async () => {
      const direct = shareRoutes.create.response.parse(await expect(await request(`${path}/shares`, editor.cookie, 'POST', { granteeEmail: outsider.email, role: 'edit' }), 201));
      assert.equal(direct.granteeUserId, outsider.id); assert.equal(direct.url, undefined);
      const current = FileItem.parse(await expect(await request(path, outsider.cookie), 200));
      await expect(await request(`${path}/download`, outsider.cookie), 200);
      const renamed = FileItem.parse(await expect(await request(path, outsider.cookie, 'PATCH', { name: 'Granted rename.wav', ifUpdatedAt: current.updatedAt }), 200));
      await expect(await request(path, outsider.cookie, 'PATCH', { folderId: null, ifUpdatedAt: renamed.updatedAt }), 403);
      await expect(await request(path, outsider.cookie, 'PATCH', { toVaultId: outsider.vaultId, ifUpdatedAt: renamed.updatedAt }), 403);
      await expect(await request(`${root}/children`, outsider.cookie), 403);
      await expect(await request(`${path}/shares`, outsider.cookie, 'POST', {}), 403);
      await expect(await request(`${path}/shares/${direct.id}`, owner.cookie, 'DELETE'), 204);
      await expect(await request(path, outsider.cookie), 403);
      const view = shareRoutes.create.response.parse(await expect(await request(`${path}/shares`, owner.cookie, 'POST', { granteeEmail: outsider.email, role: 'view' }), 201));
      await expect(await request(path, outsider.cookie), 200);
      await expect(await request(path, outsider.cookie, 'DELETE'), 403);
      await db.update(shares).set({ expiresAt: new Date(0) }).where(eq(shares.id, view.id));
      await expect(await request(`${path}/download`, outsider.cookie), 403);
      assert.ok(!(shareRoutes.list.response.parse(await expect(await request(`${path}/shares`, owner.cookie), 200))).items.some((x) => x.id === view.id));
    });
    await t.test('share creation and revocation roll back when auditing fails', async () => {
      const link = await createLink(); const token = new URL(link.url!).pathname.split('/').pop()!;
      const before = (await db.select().from(shares)).length;
      await db.execute(sql`CREATE FUNCTION reject_share_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action IN ('share.create', 'share.revoke') THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END $$`);
      await db.execute(sql`CREATE TRIGGER reject_share_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_share_audit()`);
      try {
        assert.equal((await request(`${path}/shares`, owner.cookie, 'POST', {})).status, 500);
        assert.equal((await db.select().from(shares)).length, before);
        assert.equal((await request(`${path}/shares/${link.id}`, owner.cookie, 'DELETE')).status, 500);
        await expect(await request(`/s/${token}`), 200);
      } finally { await db.execute(sql`DROP TRIGGER reject_share_audit ON audit_log`); await db.execute(sql`DROP FUNCTION reject_share_audit()`); }
      await db.update(shares).set({ expiresAt: new Date(0) }).where(eq(shares.id, link.id));
      await expect(await request(`/s/${token}`), 404);
    });
    await t.test('links follow cross-vault moves, but never bypass verification, trash or expiry', async () => {
      const link = await createLink(); const token = new URL(link.url!).pathname.split('/').pop()!;
      const before = FileItem.parse(await expect(await request(path, owner.cookie), 200));
      await expect(await request(path, owner.cookie, 'PATCH', { toVaultId: owner.vaultId, ifUpdatedAt: before.updatedAt }), 200);
      const movedPath = `/vaults/${owner.vaultId}/files/${fileId}`;
      assert.equal((await expect(await request(`/s/${token}`), 200)).file.vaultId, owner.vaultId);
      await expect(await request(`${path}/download?token=${token}`), 404);
      await db.update(files).set({ status: 'processing' }).where(eq(files.id, fileId));
      await expect(await request(`${movedPath}/download?token=${token}`), 409);
      await expect(await request(`${movedPath}/waveform?token=${token}`), 409);
      await db.update(files).set({ status: 'ready' }).where(eq(files.id, fileId));
      await db.update(blobs).set({ verifiedAt: null }).where(eq(blobs.id, blobId));
      await expect(await request(`${movedPath}/download?token=${token}`), 409);
      await db.update(blobs).set({ verifiedAt: new Date() }).where(eq(blobs.id, blobId));
      await expect(await request(movedPath, owner.cookie, 'DELETE'), 204);
      await expect(await request(`/s/${token}`), 404);
      await expect(await request(`${movedPath}/download?token=${token}`), 404);
    });
    await t.test('removing members keeps uploads and serializes last-owner protection', async () => {
      await expect(await request(`${root}/members/${editor.id}`, viewer.cookie, 'DELETE'), 403);
      await expect(await request(`${root}/members/${editor.id}`, editor.cookie, 'DELETE'), 204);
      assert.equal((await db.select().from(files).where(eq(files.id, fileId))).length, 1);
      await expect(await request(root, editor.cookie), 403);
      await db.update(vaultMembers).set({ role: 'owner' }).where(and(eq(vaultMembers.vaultId, vault.id), eq(vaultMembers.userId, viewer.id)));
      const results = await Promise.all([
        request(`${root}/members/${owner.id}`, owner.cookie, 'DELETE'),
        request(`${root}/members/${viewer.id}`, viewer.cookie, 'DELETE'),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [204, 409]);
      assert.equal((await db.select().from(vaultMembers).where(and(eq(vaultMembers.vaultId, vault.id), eq(vaultMembers.role, 'owner')))).length, 1);
    });
    await t.test('audit failure rolls back invitation; disabled accounts cannot be invited', async () => {
      const before = (await db.select().from(auditLog)).length;
      await db.execute(sql`CREATE FUNCTION reject_t017_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'member.add' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END $$`);
      await db.execute(sql`CREATE TRIGGER reject_t017_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_t017_audit()`);
      try {
        const response = await request(`/vaults/${owner.vaultId}/members`, owner.cookie, 'POST', { email: outsider.email, role: 'editor' });
        assert.equal(response.status, 403); // Personal vault remains private before any mutation.
        const [remaining] = await db.select().from(vaultMembers).where(and(eq(vaultMembers.vaultId, vault.id), eq(vaultMembers.role, 'owner')));
        const cookie = remaining.userId === owner.id ? owner.cookie : viewer.cookie;
        assert.equal((await request(`${root}/members`, cookie, 'POST', { email: outsider.email, role: 'editor' })).status, 500);
        assert.equal((await db.select().from(vaultMembers).where(and(eq(vaultMembers.vaultId, vault.id), eq(vaultMembers.userId, outsider.id)))).length, 0);
      } finally { await db.execute(sql`DROP TRIGGER reject_t017_audit ON audit_log`); await db.execute(sql`DROP FUNCTION reject_t017_audit()`); }
      assert.equal((await db.select().from(auditLog)).length, before);
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, outsider.id));
      const [remaining] = await db.select().from(vaultMembers).where(and(eq(vaultMembers.vaultId, vault.id), eq(vaultMembers.role, 'owner')));
      const cookie = remaining.userId === owner.id ? owner.cookie : viewer.cookie;
      await expect(await request(`${root}/members`, cookie, 'POST', { email: outsider.email, role: 'editor' }), 404);
      await expect(await request(root, outsider.cookie), 403);
      await db.insert(vaultMembers).values({ vaultId: vault.id, userId: outsider.id, role: 'owner' });
      await expect(await request(`${root}/members/${outsider.id}`, cookie, 'DELETE'), 204);
    });
  } finally {
    try {
      const objects = await storage.client.send(new ListObjectsV2Command({ Bucket }));
      if (objects.Contents?.length) await storage.client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key! })) } }));
      await storage.client.send(new DeleteBucketCommand({ Bucket }));
    } finally {
      storage.client.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())); await db.$client.end();
      await admin.execute(sql.raw(`DROP DATABASE "${databaseName}"`)); await admin.$client.end();
    }
  }
});
