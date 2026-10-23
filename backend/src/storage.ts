import { S3Client } from '@aws-sdk/client-s3';

function endpointUrl(env: NodeJS.ProcessEnv, key: 'S3_ENDPOINT' | 'S3_PUBLIC_ENDPOINT') {
  const endpoint = new URL(env[key]!);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error(`${key} must be an HTTP(S) URL without credentials, query or fragment`);
  }
  if (env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') throw new Error(`${key} must use HTTPS in production`);
  return endpoint.toString();
}

export function createStorage(env: NodeJS.ProcessEnv = process.env) {
  for (const key of ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) {
    if (!env[key]) throw new Error(`${key} is required`);
  }
  const endpoint = endpointUrl(env, 'S3_ENDPOINT');
  // S3_PUBLIC_ENDPOINT: the host browsers reach (compose: localhost:9000 vs rustfs:9000). Presigned URLs only.
  const publicEndpoint = env.S3_PUBLIC_ENDPOINT ? endpointUrl(env, 'S3_PUBLIC_ENDPOINT') : endpoint;
  if (env.S3_FORCE_PATH_STYLE !== undefined && !['true', 'false'].includes(env.S3_FORCE_PATH_STYLE)) {
    throw new Error('S3_FORCE_PATH_STYLE must be true or false');
  }
  const s3 = (endpoint: string) => new S3Client({
    endpoint, region: env.S3_REGION!,
    credentials: { accessKeyId: env.S3_ACCESS_KEY!, secretAccessKey: env.S3_SECRET_KEY! },
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== 'false',
    // Presigning has no body; do not sign a default checksum of an empty payload.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  const client = s3(endpoint);
  // presign only ever signs (no requests sent), so it needs no destroy().
  return { bucket: env.S3_BUCKET!, client, presign: publicEndpoint === endpoint ? client : s3(publicEndpoint) };
}

export type Storage = ReturnType<typeof createStorage>;
