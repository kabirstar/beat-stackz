import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.ts';

test('health responds without database or storage credentials', async () => {
  const response = await createApp().request('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('only the configured browser origin gets credentialed CORS access', async () => {
  const app = createApp('http://localhost:5173');
  for (const origin of ['http://localhost:5173', 'https://untrusted.example']) {
    const response = await app.request('/health', { headers: { Origin: origin } });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),
      origin === 'http://localhost:5173' ? origin : null);
  }
  const preflight = await app.request('/health', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
});

test('invalid origins fail at startup', () => {
  for (const origin of ['*', 'file:///tmp', 'https://example.com/path', 'https://example.com/']) {
    assert.throws(() => createApp(origin));
  }
});

test('unimplemented routes do not claim to serve vault data', async () => {
  const app = createApp();
  for (const path of ['/vaults', '/api/beats', '/api/packs']) {
    assert.equal((await app.request(path)).status, 404);
  }
});
