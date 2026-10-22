import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Config } from './config.ts';
import type { Database } from './db/index.ts';
import * as schema from './db/schema.ts';

export function createAuth(db: Database, config: Config) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema, usePlural: true, transaction: true }),
    baseURL: config.authUrl,
    basePath: '/auth',
    secret: config.secret,
    trustedOrigins: [config.webOrigin],
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;
