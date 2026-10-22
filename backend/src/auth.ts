import { betterAuth } from 'better-auth/minimal';
import type { BetterAuthOptions } from 'better-auth';
import { Id } from '@bpackz/shared';
import { DrizzleQueryError } from 'drizzle-orm';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { Config } from './config.ts';
import type { Database } from './db/index.ts';
import * as schema from './db/schema.ts';
import { createPersonalVault } from './personal-vault.ts';

export function createAuth(db: Database, config: Config) {
  return betterAuth({
    database: (options: BetterAuthOptions) => {
      const adapter = drizzleAdapter(db, { provider: 'pg', schema, usePlural: true, transaction: true })(options);
      // Better Auth's after hooks run after commit; provisioning must share signup's transaction.
      adapter.transaction = async (callback) => {
        try {
          return await db.transaction(async (transaction) => {
            const scoped = drizzleAdapter(transaction, { provider: 'pg', schema, usePlural: true, transaction: false })(options);
            const create = scoped.create.bind(scoped);
            scoped.create = async <T extends Record<string, any>, R = T>(input: Parameters<typeof scoped.create<T, R>>[0]): Promise<R> => {
              try {
                const created = await create<T, R>(input);
                if (input.model === 'user') {
                  if (!created || typeof created !== 'object' || !('id' in created)) throw new Error('Created user has no id');
                  await createPersonalVault(transaction, Id.parse(created.id));
                }
                return created;
              } catch (error) {
                if (error instanceof DrizzleQueryError) throw new Error('Authentication database operation failed');
                throw error;
              }
            };
            return callback(scoped);
          });
        } catch (error) {
          // Drizzle errors include query parameters, which can contain auth secrets.
          if (error instanceof DrizzleQueryError) throw new Error('Authentication database operation failed');
          throw error;
        }
      };
      return adapter;
    },
    baseURL: config.authUrl,
    basePath: '/auth',
    secret: config.secret,
    trustedOrigins: [config.webOrigin],
    emailAndPassword: { enabled: true },
  });
}

export type Auth = ReturnType<typeof createAuth>;
