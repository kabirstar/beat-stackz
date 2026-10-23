import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { eq, inArray, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { ApiError, FileItem, Folder, Vault, authRoutes, fileRoutes, folderRoutes, vaultRoutes } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { blobs, files, users, vaultMembers, vaults } from '../src/db/schema.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('HTTP vault/folder/file permissions, concurrency, pagination, trash and audit rollback', {
  skip: databaseUrl ? false : 'Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test',
  timeout: 30000,
}, async (t) => {
  assert.ok(databaseUrl);
  assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/);
  const config = readConfig({ DATABASE_URL: databaseUrl, BETTER_AUTH_SECRET: randomUUID() + randomUUID() });
  const db = createDatabase(databaseUrl);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  const server = serve({ fetch: createApp(config.webOrigin, createAuth(db, config), db).fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  const userIds: string[] = [];
  const blobId = randomUUID();
  const sha = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const request = (path: string, cookie = '', method = 'GET', input?: unknown) => fetch(origin + path, {
    method, headers: { Cookie: cookie, Origin: config.webOrigin, 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const expect = async (response: Response, status: number) => {
    const data = status === 204 ? null : await response.json();
    assert.equal(response.status, status, JSON.stringify(data));
    if (status >= 400) ApiError.parse(data);
    return data;
  };
  const signup = async () => {
    const response = await request('/auth/sign-up/email', '', 'POST', {
      name: 'Vault Test', email: `${randomUUID()}@example.com`, password: randomUUID(), inviteCode: 'dev',
    });
    const data = await expect(response, 200);
    userIds.push(data.user.id);
    const cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const me = authRoutes.me.response.parse(await expect(await request('/me', cookie), 200));
    return { cookie, id: me.user.id, personalVaultId: me.personalVaultId };
  };
  try {
    const owner = await signup();
    const editor = await signup();
    const viewer = await signup();
    const outsider = await signup();
    const shared = Vault.parse(await expect(await request('/vaults', owner.cookie, 'POST', { name: '  Session  ' }), 201));
    const destination = Vault.parse(await expect(await request('/vaults', owner.cookie, 'POST', { name: 'Destination' }), 201));
    const root = `/vaults/${shared.id}`;
    assert.equal(shared.kind, 'shared');
    assert.equal(shared.name, 'Session');
    assert.equal(shared.myRole, 'owner');
    // Membership and blob fixtures stand in for later invite/upload routes.
    await db.insert(vaultMembers).values([
      { vaultId: shared.id, userId: editor.id, role: 'editor' },
      { vaultId: shared.id, userId: viewer.id, role: 'viewer' },
    ]);
    await db.insert(blobs).values({ id: blobId, verifiedAt: new Date(), sha256: sha, s3Key: `test/${sha}`, size: 12345, mime: 'audio/wav', refCount: 0 });
    const createFolder = async (name: string, parentId: string | null = null, cookie = owner.cookie) =>
      Folder.parse(await expect(await request(`${root}/folders`, cookie, 'POST', { name, parentId }), 201));
    const seedFile = async (name: string, folderId: string | null = null, vaultId = shared.id) => {
      const id = randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(files).values({ id, name, folderId, vaultId, blobId, status: 'ready', createdBy: owner.id });
        await tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1` }).where(eq(blobs.sha256, sha));
      });
      return FileItem.parse(await expect(await request(`/vaults/${vaultId}/files/${id}`, owner.cookie), 200));
    };

    await t.test('session, role and origin boundaries; shared schemas reject invalid input', async () => {
      await expect(await request('/vaults'), 401);
      const listing = vaultRoutes.list.response.parse(await expect(await request('/vaults', owner.cookie), 200));
      assert.deepEqual(new Set(listing.items.map((v) => v.id)), new Set([owner.personalVaultId, shared.id, destination.id]));
      assert.equal(Vault.parse(await expect(await request(root, viewer.cookie), 200)).myRole, 'viewer');
      await expect(await request(root, outsider.cookie), 403);
      await expect(await request(root, editor.cookie, 'PATCH', { name: 'Denied' }), 403);
      assert.equal(Vault.parse(await expect(await request(root, owner.cookie, 'PATCH', { name: 'Renamed vault' }), 200)).name, 'Renamed vault');
      await expect(await request(`${root}/folders`, viewer.cookie, 'POST', { name: 'Denied', parentId: null }), 403);
      const invalid = await expect(await request(`${root}/folders`, owner.cookie, 'POST', { name: 'private-value/not-for-errors', parentId: null }), 400);
      assert.deepEqual(invalid.issues, [{ path: 'name', message: 'no slashes' }]);
      assert.ok(!JSON.stringify(invalid).includes('private-value'));
      await expect(await request(`${root}/children?limit=201`, owner.cookie), 400);
      await expect(await request(`${root}/children?cursor=`, owner.cookie), 400);
      const badOrigin = await fetch(origin + '/vaults', { method: 'POST', headers: {
        Cookie: owner.cookie, Origin: 'https://untrusted.example', 'Content-Type': 'application/json',
      }, body: JSON.stringify({ name: 'Denied' }) });
      await expect(badOrigin, 403);
      const badJson = await fetch(origin + '/vaults', { method: 'POST', headers: {
        Cookie: owner.cookie, Origin: config.webOrigin, 'Content-Type': 'application/json',
      }, body: '{' });
      await expect(badJson, 400);
    });

    await t.test('folder parents, breadcrumbs, stale edits, collisions and concurrent cycle prevention', async () => {
      const parent = await createFolder('Parent', null, editor.cookie);
      const child = await createFolder('Child', parent.id);
      const detail = folderRoutes.get.response.parse(await expect(await request(`${root}/folders/${child.id}`, viewer.cookie), 200));
      assert.deepEqual(detail.breadcrumb.map((f) => f.id), [parent.id, child.id]);
      await expect(await request(`${root}/folders/${child.id}`, outsider.cookie), 403);
      await expect(await request(`/vaults/${destination.id}/folders/${child.id}`, owner.cookie), 404);
      await expect(await request(`/vaults/${destination.id}/folders`, owner.cookie, 'POST', { name: 'Cross parent', parentId: parent.id }), 404);
      const cycle = { parentId: child.id, ifUpdatedAt: parent.updatedAt };
      await expect(await request(`${root}/folders/${parent.id}`, owner.cookie, 'PATCH', cycle), 409);
      const edits = await Promise.all(['New A', 'New B'].map((name) => request(`${root}/folders/${child.id}`, editor.cookie, 'PATCH', { name, ifUpdatedAt: child.updatedAt })));
      assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
      const renamed = Folder.parse(await edits.find((r) => r.status === 200)!.json());
      assert.notEqual(renamed.updatedAt, child.updatedAt);
      const moved = Folder.parse(await expect(await request(`${root}/folders/${child.id}`, owner.cookie, 'PATCH', { parentId: null, ifUpdatedAt: renamed.updatedAt }), 200));
      assert.equal(moved.parentId, null);
      const collisions = await Promise.all([1, 2].map(() => request(`${root}/folders`, owner.cookie, 'POST', { name: 'Unique root', parentId: null })));
      assert.deepEqual(collisions.map((r) => r.status).sort(), [201, 409]);
      const left = await createFolder('Left');
      const right = await createFolder('Right');
      const moves = await Promise.all([
        request(`${root}/folders/${left.id}`, owner.cookie, 'PATCH', { parentId: right.id, ifUpdatedAt: left.updatedAt }),
        request(`${root}/folders/${right.id}`, owner.cookie, 'PATCH', { parentId: left.id, ifUpdatedAt: right.updatedAt }),
      ]);
      assert.deepEqual(moves.map((r) => r.status).sort(), [200, 409]);
    });

    await t.test('file metadata, keyset pages, name collisions and cross-vault authorization', async () => {
      const folder = await createFolder('Tracks');
      const tracks = await Promise.all(['a.wav', 'b.wav', 'c.wav'].map((name) => seedFile(name, folder.id)));
      let cursor: string | null = null;
      const seen: string[] = [];
      do {
        const page = fileRoutes.listChildren.response.parse(await expect(await request(`${root}/children?folderId=${folder.id}&limit=2${cursor ? `&cursor=${cursor}` : ''}`, viewer.cookie), 200));
        seen.push(...page.files.map((f) => f.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(seen.length, 3);
      assert.deepEqual(new Set(seen), new Set(tracks.map((f) => f.id)));
      const track = tracks[0];
      assert.equal(track.size, 12345);
      assert.equal(track.hasWaveform, false);
      const path = `${root}/files/${track.id}`;
      await expect(await request(path, outsider.cookie), 403);
      await expect(await request(`/vaults/${destination.id}/files/${track.id}`, owner.cookie), 404);
      await expect(await request(path, viewer.cookie, 'PATCH', { name: 'Denied', ifUpdatedAt: track.updatedAt }), 403);
      await expect(await request(`${root}/folders`, owner.cookie, 'POST', { name: track.name, parentId: folder.id }), 409);
      const reserved = await createFolder('Reserved', folder.id);
      await expect(await request(path, owner.cookie, 'PATCH', { name: reserved.name, ifUpdatedAt: track.updatedAt }), 409);
      await expect(await request(path, editor.cookie, 'PATCH', { toVaultId: destination.id, ifUpdatedAt: track.updatedAt }), 403);
      await expect(await request(path, owner.cookie, 'PATCH', { toVaultId: outsider.personalVaultId, ifUpdatedAt: track.updatedAt }), 403);
      await expect(await request(path, owner.cookie, 'PATCH', { toVaultId: destination.id, folderId: folder.id, ifUpdatedAt: track.updatedAt }), 404);
      const edits = await Promise.all(['Mix A.wav', 'Mix B.wav'].map((name) => request(path, editor.cookie, 'PATCH', { name, ifUpdatedAt: track.updatedAt })));
      assert.deepEqual(edits.map((r) => r.status).sort(), [200, 409]);
      const renamed = FileItem.parse(await edits.find((r) => r.status === 200)!.json());
      const moved = FileItem.parse(await expect(await request(path, owner.cookie, 'PATCH', { toVaultId: destination.id, ifUpdatedAt: renamed.updatedAt }), 200));
      assert.equal(moved.folderId, null);
      assert.equal(moved.vaultId, destination.id);
      assert.equal(moved.sha256, track.sha256);
      await expect(await request(path, owner.cookie), 404);
      const audits = await db.execute(sql`select vault_id from audit_log where target_id = ${track.id} and action in ('file.update', 'file.move_in')`);
      assert.deepEqual(new Set(audits.rows.map((r) => r.vault_id)), new Set([shared.id, destination.id]));
      const reverse = await seedFile('Reverse.wav');
      const opposite = await Promise.all([
        request(`/vaults/${destination.id}/files/${moved.id}`, owner.cookie, 'PATCH', { toVaultId: shared.id, ifUpdatedAt: moved.updatedAt }),
        request(`${root}/files/${reverse.id}`, owner.cookie, 'PATCH', { toVaultId: destination.id, ifUpdatedAt: reverse.updatedAt }),
      ]);
      assert.deepEqual(opposite.map((r) => r.status), [200, 200]);
    });

    await t.test('soft trash cascades, preserves blobs, frees names and serializes child creation', async () => {
      const parent = await createFolder('Trash parent');
      const child = await createFolder('Trash child', parent.id);
      const nested = await seedFile('Nested.wav', child.id);
      const standalone = await seedFile('Standalone.wav');
      const [blobBefore] = await db.select().from(blobs).where(eq(blobs.sha256, sha));
      await expect(await request(`${root}/files/${standalone.id}`, viewer.cookie, 'DELETE'), 403);
      await expect(await request(`${root}/files/${standalone.id}`, editor.cookie, 'DELETE'), 204);
      await expect(await request(`${root}/files/${standalone.id}`, owner.cookie), 404);
      await createFolder(standalone.name);
      await expect(await request(`${root}/folders/${parent.id}`, viewer.cookie, 'DELETE'), 403);
      await expect(await request(`${root}/folders/${parent.id}`, editor.cookie, 'DELETE'), 204);
      for (const id of [parent.id, child.id]) await expect(await request(`${root}/folders/${id}`, owner.cookie), 404);
      await expect(await request(`${root}/files/${nested.id}`, owner.cookie), 404);
      await expect(await request(`${root}/children?folderId=${child.id}`, owner.cookie), 404);
      await expect(await request(`${root}/folders`, owner.cookie, 'POST', { name: 'Hidden', parentId: child.id }), 404);
      await createFolder(parent.name);
      const cascaded = await db.execute(sql`select target_id from audit_log where action in ('folder.trash', 'file.trash') and target_id in (${parent.id}, ${child.id}, ${nested.id})`);
      assert.equal(cascaded.rowCount, 3);
      const [blobAfter] = await db.select().from(blobs).where(eq(blobs.sha256, sha));
      assert.equal(blobAfter.refCount, blobBefore.refCount, 'trash retains blob references until purge');
      assert.ok((await db.select().from(files).where(eq(files.id, nested.id)))[0].deletedAt);
      const raceParent = await createFolder('Race parent');
      const race = await Promise.all([
        request(`${root}/folders/${raceParent.id}`, owner.cookie, 'DELETE'),
        request(`${root}/folders`, editor.cookie, 'POST', { parentId: raceParent.id, name: 'Race child' }),
      ]);
      assert.equal(race[0].status, 204);
      assert.ok([201, 404].includes(race[1].status));
      const orphans = await db.execute(sql`select child.id from folders child join folders parent on parent.id = child.parent_id
        where child.vault_id = ${shared.id} and child.deleted_at is null and parent.deleted_at is not null`);
      assert.equal(orphans.rowCount, 0);
    });

    await t.test('audit failure rolls back mutations; deleted accounts/vaults lose access', async () => {
      const target = await createFolder('Atomic');
      await db.execute(sql.raw(`ALTER TABLE audit_log ADD CONSTRAINT test_crud_audit_failure CHECK (target_id IS DISTINCT FROM '${target.id}' OR action <> 'folder.update')`));
      try {
        const failed = await request(`${root}/folders/${target.id}`, owner.cookie, 'PATCH', { name: 'Must roll back', ifUpdatedAt: target.updatedAt });
        assert.equal(failed.status, 500);
        assert.equal(await failed.text(), 'Internal server error');
        const unchanged = folderRoutes.get.response.parse(await expect(await request(`${root}/folders/${target.id}`, owner.cookie), 200));
        assert.equal(unchanged.folder.name, target.name);
        assert.equal(unchanged.folder.updatedAt, target.updatedAt);
      } finally {
        await db.execute(sql`ALTER TABLE audit_log DROP CONSTRAINT test_crud_audit_failure`);
      }
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, viewer.id));
      await expect(await request(root, viewer.cookie), 403);
      await db.update(vaults).set({ deletedAt: new Date() }).where(eq(vaults.id, destination.id));
      await expect(await request(`/vaults/${destination.id}`, owner.cookie), 403);
      const remaining = vaultRoutes.list.response.parse(await expect(await request('/vaults', owner.cookie), 200));
      assert.ok(!remaining.items.some((v) => v.id === destination.id));
    });
  } finally {
    try {
      if (userIds.length) {
        await db.delete(vaults).where(inArray(vaults.createdBy, userIds));
        await db.delete(users).where(inArray(users.id, userIds));
      }
      await db.delete(blobs).where(eq(blobs.sha256, sha));
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await db.$client.end();
    }
  }
});
