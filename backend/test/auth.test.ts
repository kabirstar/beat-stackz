import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiError } from '@bpackz/shared';
import { createApp } from '../src/app.ts';
import { createAuth } from '../src/auth.ts';
import { readConfig } from '../src/config.ts';
import { createDatabase } from '../src/db/index.ts';

const environment = {
  DATABASE_URL: 'postgres://localhost:1/bpackz_test',
  BETTER_AUTH_SECRET: '5ef063c8d23b9a2d1d84eea3e18a12899cf00cda4fa71e320d07b74ced589d45',
};

test('configuration rejects missing credentials, example secrets, and unsafe production origins', () => {
  assert.throws(() => readConfig({}));
  assert.throws(() => readConfig({ ...environment, DATABASE_URL: 'https://example.com' }));
  assert.throws(() => readConfig({ ...environment, BETTER_AUTH_SECRET: 'change-me-32-chars-minimum-random-string' }));
  assert.throws(() => readConfig({ ...environment, WEB_ORIGIN: 'https://web.example/path' }));
  assert.throws(() => readConfig({ ...environment, NODE_ENV: 'production' }));
  const production = { ...environment, NODE_ENV: 'production', BETTER_AUTH_URL: 'https://api.example', WEB_ORIGIN: 'https://web.example' };
  assert.throws(() => readConfig(production), /INVITE_CODE/, 'production requires an invite code (ADR 0003)');
  assert.doesNotThrow(() => readConfig({ ...production, INVITE_CODE: 'letmein' }));
  assert.equal(readConfig(environment).inviteCode, undefined, 'development may leave the invite code unset');
});

test('real Better Auth handler validates requests before opening a database connection', async () => {
  const config = readConfig(environment);
  const db = createDatabase(config.databaseUrl);
  const app = createApp(config.webOrigin, createAuth(db, config));
  const request = (path: string, init?: RequestInit) => app.request(`http://localhost:4000${path}`, init);
  try {
    const anonymous = await request('/auth/get-session');
    assert.equal(anonymous.status, 200);
    assert.equal(await anonymous.json(), null);

    const malformed = await request('/auth/sign-up/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.webOrigin },
      body: JSON.stringify({ email: 'not-an-email', password: 'short' }),
    });
    assert.equal(malformed.status, 400);

    const withoutCode = await request('/auth/sign-up/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: config.webOrigin },
      body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'valid-test-password' }),
    });
    assert.equal(withoutCode.status, 400, 'inviteCode is required by SignUpBody even when INVITE_CODE is unset');
    assert.equal(ApiError.parse(await withoutCode.json()).error, 'invalid');

    const untrusted = await request('/auth/sign-up/email', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' },
      body: JSON.stringify({ name: 'Test', email: 'test@example.com', password: 'valid-test-password', inviteCode: 'any' }),
    });
    assert.equal(untrusted.status, 403);
    assert.equal(untrusted.headers.get('Access-Control-Allow-Origin'), null);

    const missing = await request('/unknown');
    assert.equal(missing.status, 404);
    assert.equal(ApiError.parse(await missing.json()).error, 'not_found');
    assert.equal(db.$client.totalCount, 0, 'invalid requests should not touch PostgreSQL');
  } finally {
    await db.$client.end();
  }
});
