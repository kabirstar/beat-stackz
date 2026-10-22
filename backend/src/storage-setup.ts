import { CreateBucketCommand, GetBucketCorsCommand, HeadBucketCommand, PutBucketCorsCommand, GetBucketLifecycleConfigurationCommand, PutBucketLifecycleConfigurationCommand, type LifecycleRule, type CORSRule } from '@aws-sdk/client-s3';
import { createStorage, type Storage } from './storage.ts';

export async function configureBucket(storage: Storage, origin: string) {
  const { client, bucket: Bucket } = storage;
  if (new URL(origin).origin !== origin) throw new Error('WEB_ORIGIN must be an origin without a path');
  try { await client.send(new HeadBucketCommand({ Bucket })); }
  catch (error) {
    if (!(error instanceof Error) || !['NotFound', 'NoSuchBucket'].includes(error.name)) throw error;
    await client.send(new CreateBucketCommand({ Bucket }));
  }
  let rules: CORSRule[];
  try { rules = (await client.send(new GetBucketCorsCommand({ Bucket }))).CORSRules ?? []; }
  catch (error) {
    if (!(error instanceof Error) || error.name !== 'NoSuchCORSConfiguration') throw error;
    rules = [];
  }
  await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [
    ...rules.filter((rule) => rule.ID !== 'bpackz-web'),
    { ID: 'bpackz-web', AllowedOrigins: [origin], AllowedMethods: ['PUT', 'GET', 'HEAD'], AllowedHeaders: ['*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 300 },
  ] } }));
  let lifecycle: LifecycleRule[];
  try { lifecycle = (await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket }))).Rules ?? []; }
  catch (error) {
    if (!(error instanceof Error) || !['NoSuchLifecycleConfiguration', 'NoSuchLifecycle'].includes(error.name)) throw error;
    lifecycle = [];
  }
  await client.send(new PutBucketLifecycleConfigurationCommand({ Bucket, LifecycleConfiguration: { Rules: [
    ...lifecycle.filter((rule) => rule.ID !== 'bpackz-incomplete-uploads'),
    { ID: 'bpackz-incomplete-uploads', Status: 'Enabled', Filter: { Prefix: 'blobs/' }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } },
  ] } }));
}

if (import.meta.main) {
  const storage = createStorage();
  try {
    await configureBucket(storage, process.env.WEB_ORIGIN ?? 'http://localhost:5173');
    console.log('Storage bucket, browser CORS and incomplete-upload lifecycle configured');
  } finally { storage.client.destroy(); }
}
