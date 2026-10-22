import { CreateBucketCommand, GetBucketCorsCommand, HeadBucketCommand, PutBucketCorsCommand, type CORSRule } from '@aws-sdk/client-s3';
import { createStorage } from './storage.ts';

const { client, bucket: Bucket } = createStorage();
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
if (new URL(origin).origin !== origin) throw new Error('WEB_ORIGIN must be an origin without a path');
try {
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
  console.log('Storage bucket and browser CORS configured');
} finally {
  client.destroy();
}
