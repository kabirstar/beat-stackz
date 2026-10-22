import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { ApiError, authRoutes, User } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { users, vaults } from '../src/db/schema.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('HTTP/PostgreSQL signup, cookie sessions, signout, and transactional audit', {
  skip: databaseUrl ? false : 'Set TEST_DATABASE_URL to a dedicated PostgreSQL database ending in _test',
}, async () => {
  assert.ok(databaseUrl);
  assert.match(new URL(databaseUrl).pathname, /\/[^/]+_test$/, 'Use a dedicated test database');
  const config = readConfig({
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  });
  const db = createDatabase(config.databaseUrl);
  const app = createApp(config.webOrigin, createAuth(db, config), db);
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const email = `auth-${randomUUID()}@example.com`;
  const password = randomUUID() + '-test-password';
  let userId: string | undefined;
  let otherUserId: string | undefined;
  const legacyId = randomUUID();
  const deletedLegacyId = randomUUID();
  const request = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}/auth${path}`, init);
  const post = (path: string, body: object, cookie = '') => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: config.webOrigin, Cookie: cookie },
    body: JSON.stringify(body),
  });
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    await db.insert(users).values([
      { id: legacyId, name: 'Legacy', email: `${legacyId}@example.com` },
      { id: deletedLegacyId, name: 'Deleted legacy', email: `${deletedLegacyId}@example.com`, deletedAt: new Date() },
    ]);
    const migration = await readFile(new URL('../drizzle/0003_personal-vault.sql', import.meta.url), 'utf8');
    const backfill = migration.split('--> statement-breakpoint').at(-1)!;
    await db.execute(sql.raw(backfill));
    await db.execute(sql.raw(backfill));
    const legacyVault = await db.execute(sql`select v.id, m.role from vaults v join vault_members m on m.vault_id = v.id
      where v.created_by = ${legacyId} and m.user_id = ${legacyId}`);
    assert.equal(legacyVault.rowCount, 1, 'backfill must be idempotent');
    assert.equal(legacyVault.rows[0].role, 'owner');
    assert.equal((await db.execute(sql`select id from vaults where created_by = ${deletedLegacyId}`)).rowCount, 0);
    assert.equal((await db.execute(sql`select id from audit_log where actor_id = ${legacyId} and vault_id = ${legacyVault.rows[0].id}`)).rowCount, 2);
    const signup = await post('/sign-up/email', { name: 'Auth Test', email, password });
    assert.equal(signup.status, 200);
    const signupData = await signup.json();
    userId = User.parse(signupData.user).id;
    const cookies = signup.headers.getSetCookie();
    assert.ok(cookies.some((cookie) => /HttpOnly/i.test(cookie)));
    assert.equal(signup.headers.get('Access-Control-Allow-Origin'), config.webOrigin);
    assert.equal(signup.headers.get('Access-Control-Allow-Credentials'), 'true');
    const cookie = cookies.map((value) => value.split(';')[0]).join('; ');
    assert.ok(cookie);

    const me = (cookie = '') => fetch(`http://127.0.0.1:${address.port}/me`, { headers: { Cookie: cookie } });
    const anonymousMe = await me();
    assert.equal(anonymousMe.status, 401);
    assert.equal(ApiError.parse(await anonymousMe.json()).error, 'unauthorized');
    const meResponse = await me(cookie);
    assert.equal(meResponse.status, 200);
    assert.equal(meResponse.headers.get('Cache-Control'), 'no-store');
    const personal = authRoutes.me.response.parse(await meResponse.json());
    assert.equal(personal.user.id, userId);
    const membership = await db.execute(sql`select role from vault_members where vault_id = ${personal.personalVaultId} and user_id = ${userId}`);
    assert.equal(membership.rows[0]?.role, 'owner');
    const domainAudit = await db.execute(sql`select action from audit_log where vault_id = ${personal.personalVaultId}`);
    assert.deepEqual(domainAudit.rows.map((row) => row.action).sort(), ['member.add', 'vault.create']);
    const repeatedMe = authRoutes.me.response.parse(await (await me(cookie)).json());
    assert.equal(repeatedMe.personalVaultId, personal.personalVaultId);
    const duplicate = await post('/sign-up/email', { name: 'Duplicate', email, password });
    assert.equal(duplicate.status, 422);
    const personalCount = await db.execute(sql`select id from vaults where created_by = ${userId} and kind = 'personal'`);
    assert.equal(personalCount.rowCount, 1);
    await assert.rejects(db.insert(vaults).values({ id: randomUUID(), createdBy: userId, kind: 'personal', name: 'Duplicate' }));

    const otherSignup = await post('/sign-up/email', { name: 'Other', email: `other-${randomUUID()}@example.com`, password });
    assert.equal(otherSignup.status, 200);
    otherUserId = User.parse((await otherSignup.json()).user).id;
    const otherCookie = otherSignup.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    const otherMe = authRoutes.me.response.parse(await (await me(otherCookie)).json());
    assert.equal(otherMe.user.id, otherUserId);
    assert.notEqual(otherMe.personalVaultId, personal.personalVaultId);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, otherUserId));
    assert.equal((await me(otherCookie)).status, 403, 'soft-deleted users cannot access /me');

    const rejectedEmail = `rollback-${randomUUID()}@example.com`;
    const rejectedAgent = `rollback-${randomUUID()}`;
    const signupCounts = () => db.execute(sql`select
      (select count(*) from users) as users, (select count(*) from accounts) as accounts,
      (select count(*) from sessions) as sessions, (select count(*) from vaults) as vaults,
      (select count(*) from vault_members) as members, (select count(*) from audit_log) as audits`);
    const beforeFailure = await signupCounts();
    await db.execute(sql.raw(`ALTER TABLE sessions ADD CONSTRAINT test_signup_rollback CHECK (user_agent IS DISTINCT FROM '${rejectedAgent}')`));
    try {
      const rejected = await request('/sign-up/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.webOrigin, 'User-Agent': rejectedAgent },
        body: JSON.stringify({ name: 'Rollback', email: rejectedEmail, password }),
      });
      assert.ok(rejected.status >= 400);
      const orphan = await db.execute(sql`select id from users where email = ${rejectedEmail}`);
      assert.equal(orphan.rowCount, 0, 'failed signup must roll back its user and dependent vault');
      assert.deepEqual((await signupCounts()).rows, beforeFailure.rows, 'failed signup must roll back every auth/domain/audit write');
    } finally {
      await db.execute(sql`ALTER TABLE sessions DROP CONSTRAINT test_signup_rollback`);
    }

    const session = await request('/get-session', { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal(User.parse((await session.json()).user).id, userId);
    assert.equal((await post('/sign-in/email', { email, password: 'wrong-test-password' })).status, 401);

    const signedOut = await post('/sign-out', {}, cookie);
    assert.equal(signedOut.status, 200);
    const expired = await request('/get-session', { headers: { Cookie: cookie } });
    assert.equal(await expired.json(), null);
    assert.equal((await me(cookie)).status, 401);
    const signedIn = await post('/sign-in/email', { email, password });
    assert.equal(signedIn.status, 200);
    const loginCookie = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert.ok(loginCookie);
    const loginSession = await request('/get-session', { headers: { Cookie: loginCookie } });
    assert.equal(User.parse((await loginSession.json()).user).id, userId);
    assert.equal(authRoutes.me.response.parse(await (await me(loginCookie)).json()).personalVaultId, personal.personalVaultId);

    const actions = await db.execute(sql`select action from audit_log where actor_id = ${userId}`);
    assert.ok(actions.rows.some((row) => row.action === 'auth.users.insert'));
    assert.ok(actions.rows.some((row) => row.action === 'auth.accounts.insert'));
    assert.ok(actions.rows.some((row) => row.action === 'auth.sessions.delete'));

    await db.execute(sql`update sessions set updated_at = now() where user_id = ${userId}`);
    const refreshed = await db.execute(sql`select id from audit_log where actor_id = ${userId} and action = 'auth.sessions.update'`);
    assert.equal(refreshed.rowCount, 0, 'routine session refresh must not generate audit noise');
    const verificationId = randomUUID();
    await db.execute(sql`insert into verifications (id, identifier, value, expires_at)
      values (${verificationId}, 'test', 'test', now() + interval '1 minute')`);
    await db.execute(sql`update verifications set value = 'changed' where id = ${verificationId}`);
    await db.execute(sql`delete from verifications where id = ${verificationId}`);
    const verificationAudit = await db.execute(sql`select id from audit_log where target_id = ${verificationId}`);
    assert.equal(verificationAudit.rowCount, 0, 'verification plumbing must not generate audit rows');
    const indexes = await db.execute(sql`select indexname from pg_indexes where tablename = 'audit_log'`);
    assert.ok(indexes.rows.some((row) => row.indexname === 'audit_log_actor_at_idx'));
    assert.ok(indexes.rows.some((row) => row.indexname === 'audit_log_vault_at_idx'));

    const rollbackId = randomUUID();
    await assert.rejects(db.transaction(async (transaction) => {
      await transaction.insert(users).values({ id: rollbackId, name: 'Rollback', email: `${rollbackId}@example.com` });
      throw new Error('test rollback');
    }), /test rollback/);
    const rolledBack = await db.execute(sql`select id from audit_log where actor_id = ${rollbackId}`);
    assert.equal(rolledBack.rowCount, 0, 'audit rows must roll back with the mutation');
  } finally {
    try {
      for (const id of [userId, otherUserId, legacyId, deletedLegacyId]) {
        if (!id) continue;
        await db.delete(vaults).where(eq(vaults.createdBy, id));
        await db.delete(users).where(eq(users.id, id));
      }
    } finally {
      try {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } finally {
        await db.$client.end();
      }
    }
  }
});
