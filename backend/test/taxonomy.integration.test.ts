import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DEFAULT_FOLDERS, Folder, authRoutes, fileRoutes, folderRoutes, vaultRoutes } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { auditLog, folders } from '../src/db/schema.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
test('default folder taxonomy is atomic, server-owned and stable across edits', {
  skip: databaseUrl ? false : 'Requires TEST_DATABASE_URL ending in _test', timeout: 30000,
}, async (t) => {
  assert.ok(databaseUrl); assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/);
  const admin = createDatabase(databaseUrl);
  const databaseName = `bpackz_taxonomy_${randomUUID().replaceAll('-', '')}_test`;
  await admin.execute(sql.raw(`CREATE DATABASE "${databaseName}"`));
  const isolated = new URL(databaseUrl); isolated.pathname = `/${databaseName}`;
  const db = createDatabase(isolated.toString());
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  const config = readConfig({ DATABASE_URL: isolated.toString(), BETTER_AUTH_SECRET: randomUUID() + randomUUID() });
  const server = serve({ fetch: createApp(config.webOrigin, createAuth(db, config), db).fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const request = (path: string, cookie = '', method = 'GET', input?: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { Cookie: cookie, Origin: config.webOrigin, 'Content-Type': 'application/json' },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
  const expect = async (response: Response, status = 200) => {
    const text = await response.text(); assert.equal(response.status, status, text);
    return text ? JSON.parse(text) : null;
  };
  const checkedFolder = (value: unknown) => {
    assert.ok(value && typeof value === 'object' && Object.hasOwn(value, 'kind'), 'wire response must include kind without relying on schema defaults');
    return Folder.parse(value);
  };
  const signup = async (email = `${randomUUID()}@example.com`) => {
    const response = await request('/auth/sign-up/email', '', 'POST', { name: 'Taxonomy', email, password: randomUUID(), inviteCode: 'dev' });
    await expect(response);
    const cookie = response.headers.getSetCookie().map((v) => v.split(';')[0]).join('; ');
    const me = authRoutes.me.response.parse(await expect(await request('/me', cookie)));
    return { cookie, id: me.user.id, vaultId: me.personalVaultId };
  };
  try {
    const owner = await signup();
    const shared = vaultRoutes.create.response.parse(await expect(await request('/vaults', owner.cookie, 'POST', { name: 'Seeded shared' }), 201));
    const tree = async (vaultId: string) => {
      const raw = await expect(await request(`/vaults/${vaultId}/children`, owner.cookie));
      raw.folders.forEach(checkedFolder);
      const roots = fileRoutes.listChildren.response.parse(raw).folders;
      assert.equal(roots.length, 5);
      const result = [...roots];
      for (const expected of DEFAULT_FOLDERS) {
        const root = roots.find((r) => r.kind === expected.kind)!;
        assert.ok(root); assert.equal(root.name, expected.name); assert.equal(root.parentId, null);
        const rawChildren = await expect(await request(`/vaults/${vaultId}/children?folderId=${root.id}`, owner.cookie));
        rawChildren.folders.forEach(checkedFolder);
        const children = fileRoutes.listChildren.response.parse(rawChildren).folders;
        assert.equal(children.length, expected.children.length);
        for (const child of expected.children) {
          assert.ok(children.some((r) => r.kind === child.kind && r.name === child.name && r.parentId === root.id));
        }
        result.push(...children);
      }
      assert.equal(result.length, 18);
      assert.ok(result.every((r) => r.createdBy === owner.id && r.vaultId === vaultId));
      return result;
    };
    let personal: Folder[] = [];
    await t.test('signup and shared-vault creation each return five roots and thirteen children', async () => {
      personal = await tree(owner.vaultId);
      const sharedTree = await tree(shared.id);
      assert.equal(new Set([...personal, ...sharedTree].map((r) => r.id)).size, 36);
      const audits = await db.select().from(auditLog).where(eq(auditLog.action, 'vault.seed_folders'));
      assert.equal(audits.length, 2);
      assert.ok(audits.every((r) => r.actorId === owner.id));
    });
    await t.test('get, rename and move retain kind; custom create/update cannot set it', async () => {
      const beats = personal.find((r) => r.kind === 'beats')!, media = personal.find((r) => r.kind === 'media')!;
      const path = `/vaults/${owner.vaultId}/folders/${beats.id}`;
      const rawDetail = await expect(await request(path, owner.cookie));
      assert.equal(checkedFolder(rawDetail.folder).kind, 'beats');
      folderRoutes.get.response.parse(rawDetail);
      const renamed = checkedFolder(await expect(await request(path, owner.cookie, 'PATCH', {
        name: 'Type beats', parentId: media.id, kind: 'media', ifUpdatedAt: beats.updatedAt,
      })));
      assert.equal(renamed.kind, 'beats'); assert.equal(renamed.parentId, media.id);
      const custom = checkedFolder(await expect(await request(`/vaults/${owner.vaultId}/folders`, owner.cookie, 'POST', {
        parentId: null, name: 'My custom folder', kind: 'songs',
      }), 201));
      assert.equal(custom.kind, null);
      const updated = checkedFolder(await expect(await request(`/vaults/${owner.vaultId}/folders/${custom.id}`, owner.cookie, 'PATCH', {
        kind: 'beats', name: 'Custom renamed', ifUpdatedAt: custom.updatedAt,
      })));
      assert.equal(updated.kind, null);
      await assert.rejects(db.execute(sql`INSERT INTO folders (id, vault_id, name, kind) VALUES (${randomUUID()}, ${owner.vaultId}, 'Invalid kind', 'invented')`));
    });
    await t.test('trashing defaults does not recreate them on vault reads', async () => {
      const songs = personal.find((r) => r.kind === 'songs')!;
      await expect(await request(`/vaults/${owner.vaultId}/folders/${songs.id}`, owner.cookie, 'DELETE'), 204);
      await expect(await request('/me', owner.cookie));
      await expect(await request(`/vaults/${owner.vaultId}`, owner.cookie));
      const listing = await expect(await request(`/vaults/${owner.vaultId}/children`, owner.cookie));
      assert.ok(!listing.folders.some((r: Folder) => r.kind === 'songs'));
      assert.equal((await db.select().from(folders).where(eq(folders.vaultId, owner.vaultId))).length, 19);
    });
    await t.test('seed audit failure rolls back folders, membership, vault and signup together', async () => {
      const counts = () => db.execute(sql`SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM accounts) AS accounts,
        (SELECT count(*) FROM sessions) AS sessions, (SELECT count(*) FROM vaults) AS vaults,
        (SELECT count(*) FROM vault_members) AS members, (SELECT count(*) FROM folders) AS folders, (SELECT count(*) FROM audit_log) AS audits`);
      const before = (await counts()).rows;
      await db.execute(sql`CREATE FUNCTION reject_seed_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'vault.seed_folders' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END $$`);
      await db.execute(sql`CREATE TRIGGER reject_seed_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_seed_audit()`);
      try {
        assert.equal((await request('/vaults', owner.cookie, 'POST', { name: 'Must roll back' })).status, 500);
        assert.deepEqual((await counts()).rows, before);
        const failed = await request('/auth/sign-up/email', '', 'POST', { name: 'Rollback', email: `${randomUUID()}@example.com`, password: randomUUID(), inviteCode: 'dev' });
        assert.ok(failed.status >= 400);
        assert.deepEqual((await counts()).rows, before);
      } finally { await db.execute(sql`DROP TRIGGER reject_seed_audit ON audit_log`); await db.execute(sql`DROP FUNCTION reject_seed_audit()`); }
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve())); await db.$client.end();
    await admin.execute(sql.raw(`DROP DATABASE "${databaseName}"`)); await admin.$client.end();
  }
});
