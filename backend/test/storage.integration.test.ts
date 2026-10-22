import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateBucketCommand,
  CreateMultipartUploadCommand, DeleteBucketCommand, DeleteObjectCommand, GetObjectCommand,
  HeadObjectCommand, ListMultipartUploadsCommand, ListPartsCommand, PutBucketCorsCommand, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PART_SIZE } from '@bpackz/shared';
import { createStorage } from '../src/storage.ts';

test('RustFS real multipart presigned PUT, completion, private GET/Range, CORS and abort', {
  skip: process.env.RUN_STORAGE_INTEGRATION === '1' ? false : 'Set RUN_STORAGE_INTEGRATION=1 and S3_* for a disposable RustFS check',
  timeout: 60000,
}, async () => {
  const { client } = createStorage();
  const Bucket = `bpackz-test-${randomUUID()}`;
  const Key = `tests/${randomUUID()}`;
  const webOrigin = 'http://localhost:5173';
  let uploadId: string | undefined;
  let bucketCreated = false;
  try {
    await client.send(new CreateBucketCommand({ Bucket }));
    bucketCreated = true;
    await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [{
      AllowedOrigins: [webOrigin], AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 300,
    }] } }));
    const started = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: 'application/octet-stream' }));
    uploadId = started.UploadId;
    assert.ok(uploadId);
    const first = Buffer.alloc(PART_SIZE, 0x61);
    const last = Buffer.from('last part');
    const parts: { PartNumber: number; ETag: string }[] = [];
    for (const [index, bytes] of [first, last].entries()) {
      const PartNumber = index + 1;
      const url = await getSignedUrl(client, new UploadPartCommand({ Bucket, Key, UploadId: uploadId, PartNumber }), { expiresIn: 300 });
      if (index === 0) {
        const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: webOrigin, 'Access-Control-Request-Method': 'PUT' } });
        assert.ok(preflight.ok);
        assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), webOrigin);
      }
      const uploaded = await fetch(url, { method: 'PUT', headers: { Origin: webOrigin }, body: bytes });
      assert.equal(uploaded.status, 200);
      const ETag = uploaded.headers.get('etag');
      assert.ok(ETag);
      assert.match(uploaded.headers.get('Access-Control-Expose-Headers') ?? '', /etag/i);
      parts.push({ PartNumber, ETag });
    }
    const listed = await client.send(new ListPartsCommand({ Bucket, Key, UploadId: uploadId }));
    assert.deepEqual(listed.Parts?.map((p) => p.Size), [PART_SIZE, last.length]);
    await client.send(new CompleteMultipartUploadCommand({ Bucket, Key, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
    uploadId = undefined;
    const head = await client.send(new HeadObjectCommand({ Bucket, Key }));
    assert.equal(head.ContentLength, PART_SIZE + last.length);
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key, ResponseContentDisposition: 'attachment; filename="fixture.bin"' }), { expiresIn: 300 });
    assert.equal(new URL(url).searchParams.get('X-Amz-Expires'), '300');
    const anonymousUrl = new URL(url);
    anonymousUrl.search = '';
    const anonymous = await fetch(anonymousUrl);
    assert.equal(anonymous.status, 403);
    await anonymous.arrayBuffer();
    const downloaded = await fetch(url);
    assert.equal(downloaded.status, 200);
    assert.match(downloaded.headers.get('Content-Disposition') ?? '', /fixture.bin/);
    const digest = createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex');
    assert.equal(digest, createHash('sha256').update(first).update(last).digest('hex'));
    const range = await fetch(url, { headers: { Range: `bytes=${PART_SIZE}-` } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), last.toString());
    const abortable = await client.send(new CreateMultipartUploadCommand({ Bucket, Key }));
    uploadId = abortable.UploadId;
    assert.ok(uploadId);
    await client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId: uploadId }));
    uploadId = undefined;
    assert.equal((await client.send(new ListMultipartUploadsCommand({ Bucket }))).Uploads?.length ?? 0, 0);
  } finally {
    try {
      if (uploadId) await client.send(new AbortMultipartUploadCommand({ Bucket, Key, UploadId: uploadId }));
      if (bucketCreated) {
        await client.send(new DeleteObjectCommand({ Bucket, Key }));
        await client.send(new DeleteBucketCommand({ Bucket }));
      }
    } finally {
      client.destroy();
    }
  }
});
