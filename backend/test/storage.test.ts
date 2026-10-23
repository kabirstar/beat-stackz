import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeadObjectCommand, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createStorage } from '../src/storage.ts';

const env = {
  S3_ENDPOINT: 'http://localhost:9000', S3_REGION: 'us-east-1', S3_BUCKET: 'bpackz_test',
  S3_ACCESS_KEY: 'test', S3_SECRET_KEY: 'test-secret', S3_FORCE_PATH_STYLE: 'true',
};

test('storage config fails without explicit credentials and rejects unsafe endpoints', () => {
  assert.throws(() => createStorage({}), /S3_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_SECRET_KEY: '' }), /S3_SECRET_KEY/);
  assert.throws(() => createStorage({ ...env, S3_ENDPOINT: 'file:///tmp' }), /S3_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_ENDPOINT: 'https://user:secret@example.com' }), /S3_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_FORCE_PATH_STYLE: 'yes' }), /S3_FORCE_PATH_STYLE/);
  assert.throws(() => createStorage({ ...env, NODE_ENV: 'production' }), /HTTPS/);
  assert.throws(() => createStorage({ ...env, S3_PUBLIC_ENDPOINT: 'ftp://localhost:9000' }), /S3_PUBLIC_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_PUBLIC_ENDPOINT: 'http://a:b@localhost:9000' }), /S3_PUBLIC_ENDPOINT/);
  assert.throws(() => createStorage({ ...env, S3_ENDPOINT: 'https://s3.example.com', S3_PUBLIC_ENDPOINT: 'http://localhost:9000', NODE_ENV: 'production' }), /S3_PUBLIC_ENDPOINT must use HTTPS/);
  const storage = createStorage(env);
  assert.equal(storage.bucket, env.S3_BUCKET);
  assert.equal(storage.presign, storage.client);
  storage.client.destroy();
});

test('S3_PUBLIC_ENDPOINT presigns against the public host while commands target the internal one', async () => {
  const storage = createStorage({ ...env, S3_ENDPOINT: 'http://rustfs:9000', S3_PUBLIC_ENDPOINT: 'http://localhost:9000' });
  assert.notEqual(storage.presign, storage.client);
  const url = new URL(await getSignedUrl(storage.presign, new UploadPartCommand({ Bucket: 'bpackz_test', Key: 'blobs/x', UploadId: 'u', PartNumber: 1 }), { expiresIn: 60 }));
  assert.equal(url.host, 'localhost:9000');
  assert.equal(url.pathname, '/bpackz_test/blobs/x');
  assert.ok(url.searchParams.get('X-Amz-Signature'));
  // Capture the request HeadObject would send without touching the network.
  let sentTo: string | undefined;
  storage.client.middlewareStack.add(() => async (args) => {
    const request = args.request as { protocol: string; hostname: string; port?: number };
    sentTo = `${request.protocol}//${request.hostname}:${request.port}`;
    throw new Error('stop');
  }, { step: 'finalizeRequest', name: 'capture' });
  await assert.rejects(storage.client.send(new HeadObjectCommand({ Bucket: 'bpackz_test', Key: 'blobs/x' })), /stop/);
  assert.equal(sentTo, 'http://rustfs:9000');
  storage.client.destroy();
});
