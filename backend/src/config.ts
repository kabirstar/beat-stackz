export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || !['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }

  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('change-me')) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters; replace the example secret');
  }

  const authUrl = env.BETTER_AUTH_URL ?? 'http://localhost:4000';
  const webOrigin = env.WEB_ORIGIN ?? 'http://localhost:5173';
  for (const [name, value] of [['BETTER_AUTH_URL', authUrl], ['WEB_ORIGIN', webOrigin]]) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value) {
      throw new Error(`${name} must be an HTTP(S) origin without a path or trailing slash`);
    }
    if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
      throw new Error(`${name} must use HTTPS in production`);
    }
  }
  return { databaseUrl, secret, authUrl, webOrigin };
}

export type Config = ReturnType<typeof readConfig>;
