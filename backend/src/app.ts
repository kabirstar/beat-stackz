import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ApiError } from '@bpackz/shared';
import type { Auth } from './auth.ts';

export function createApp(webOrigin = 'http://localhost:5173', auth?: Pick<Auth, 'handler'>) {
  const origin = new URL(webOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== webOrigin) {
    throw new Error('WEB_ORIGIN must be an HTTP(S) origin without a path or trailing slash');
  }

  const app = new Hono();
  app.use('*', cors({ origin: webOrigin, credentials: true }));
  // Liveness only: database and storage readiness belong to their integration tasks.
  app.get('/health', (context) => context.json({ status: 'ok' }));
  if (auth) app.all('/auth/*', (context) => auth.handler(context.req.raw));
  app.notFound((context) => context.json(ApiError.parse({
    error: 'not_found', message: 'Route not found',
  }), 404));
  return app;
}
