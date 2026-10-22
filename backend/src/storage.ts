import { S3Client } from '@aws-sdk/client-s3';

export function createStorage(env: NodeJS.ProcessEnv = process.env) {
  for (const key of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
    if (!env[key]) throw new Error(`${key} is required`);
  }
  const endpoint = new URL(env.S3_ENDPOINT!);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error('S3_ENDPOINT must be an HTTP(S) URL without credentials, query or fragment');
  }
  if (env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') throw new Error('S3_ENDPOINT must use HTTPS in production');
  if (env.S3_FORCE_PATH_STYLE !== undefined && !['true', 'false'].includes(env.S3_FORCE_PATH_STYLE)) {
    throw new Error('S3_FORCE_PATH_STYLE must be true or false');
  }
  return {
    bucket: env.S3_BUCKET!,
    client: new S3Client({
      endpoint: endpoint.toString(), region: env.S3_REGION!,
      credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! },
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
      // Presigning has no body; do not sign a default checksum of an empty payload.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    }),
  };
}
