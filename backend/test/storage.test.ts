import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStorage } from '../src/storage.ts';

test('storage config fails without explicit credentials and rejects unsafe endpoints', () => {
  const env = {
    S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'us-east-1', S3_BUCKET: 'bpackz_test',
    S3_ACCESS_KEY: 'test', S3_SECRET_KEY: 'test-secret', S3_FORCE_PATH_STYLE: 'true',
  };
  assert.throws(() => createStorage({}), /S3_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_SECRET_KEY: '' }), /S3_SECRET_KEY/);
  assert.throws(() => createStorage({ ...env, S3_ENDPOINT: 'file:///tmp' }), /S3_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_ENDPOINT: 'https://user:secret@example.com' }), /S3_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_FORCE_PATH_STYLE: 'yes' }), /S3_FORCE_PATH_STYLE/);
  assert.throws(() => createStorage({ ...env, NODE_ENV: 'production' }), /HTTPS/);
  const storage = createStorage(env);
  assert.equal(storage.bucket, env.S3_BUCKET);
  storage.client.destroy();
});
