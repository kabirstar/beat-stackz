import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError, authRoutes } from '@bpackz/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { Auth } from './auth.ts';
import type { Database } from './db/index.ts';
import { users, vaultMembers, vaults } from './db/schema.ts';

export function createApp(webOrigin = 'http://localhost:5173', auth?: Auth, db?: Database) {
  const origin = new URL(webOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== webOrigin) {
    throw new Error('WEB_ORIGIN must be an HTTP(S) origin without a path or trailing slash');
  }

  const app = new Hono();
  app.use('*', cors({ origin: webOrigin, credentials: true }));
  // Liveness only: database and storage readiness belong to their integration tasks.
  app.get('/health', (context) => context.json({ status: 'ok' }));
  if (auth) app.all('/auth/*', (context) => auth.handler(context.req.raw));
  if (auth && db) app.get(authRoutes.me.path, async (context) => {
    context.header('Cache-Control', 'no-store');
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) return context.json(ApiError.parse({ error: 'unauthorized', message: 'Sign in required' }), 401);
    const [personal] = await db.select({ user: users, vaultId: vaults.id }).from(users)
      .innerJoin(vaults, and(eq(vaults.createdBy, users.id), eq(vaults.kind, 'personal'), isNull(vaults.deletedAt)))
      .innerJoin(vaultMembers, and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, users.id), eq(vaultMembers.role, 'owner')))
      .where(and(eq(users.id, session.user.id), isNull(users.deletedAt)));
    if (!personal) return context.json(ApiError.parse({ error: 'forbidden', message: 'Personal vault unavailable' }), 403);
    return context.json(authRoutes.me.response.parse({
      user: { ...personal.user, createdAt: personal.user.createdAt.toISOString() },
      personalVaultId: personal.vaultId,
    }));
  });
  app.notFound((context) => context.json(ApiError.parse({
    error: 'not_found', message: 'Route not found',
  }), 404));
  return app;
}
