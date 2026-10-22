import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { User } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL signup, cookie sessions, signout, and transactional audit', {
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
  const email = `auth-${randomUUID()}@example.com`;
  const password = randomUUID() + '-test-password';
  let userId: string | undefined;
  const request = (path: string, init?: RequestInit) => app.request(`http://localhost:4000/auth${path}`, init);
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
    assert.equal((await post('/sign-in/email', { email, password })).status, 200);

    const actions = await db.execute(sql`select action from audit_log where actor_id = ${userId}`);
    assert.ok(actions.rows.some((row) => row.action === 'auth.users.insert'));
    assert.ok(actions.rows.some((row) => row.action === 'auth.accounts.insert'));
    assert.ok(actions.rows.some((row) => row.action === 'auth.sessions.delete'));

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
      await db.$client.end();
    }
  }
});
