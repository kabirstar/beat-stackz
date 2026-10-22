import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { User } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';

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
  const app = createApp(config.webOrigin, createAuth(db, config));
  const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const email = `auth-${randomUUID()}@example.com`;
  const password = randomUUID() + '-test-password';
  let userId: string | undefined;
  const request = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}/auth${path}`, init);
  const post = (path: string, body: object, cookie = '') => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: config.webOrigin, Cookie: cookie },
    body: JSON.stringify(body),
  });
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
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

    const session = await request('/get-session', { headers: { Cookie: cookie } });
    assert.equal(session.status, 200);
    assert.equal(User.parse((await session.json()).user).id, userId);
    assert.equal((await post('/sign-in/email', { email, password: 'wrong-test-password' })).status, 401);

    const signedOut = await post('/sign-out', {}, cookie);
    assert.equal(signedOut.status, 200);
    const expired = await request('/get-session', { headers: { Cookie: cookie } });
    assert.equal(await expired.json(), null);
    const signedIn = await post('/sign-in/email', { email, password });
    assert.equal(signedIn.status, 200);
    const loginCookie = signedIn.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
    assert.ok(loginCookie);
    const loginSession = await request('/get-session', { headers: { Cookie: loginCookie } });
    assert.equal(User.parse((await loginSession.json()).user).id, userId);

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
      if (userId) await db.delete(users).where(eq(users.id, userId));
    } finally {
      try {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } finally {
        await db.$client.end();
      }
    }
  }
});
