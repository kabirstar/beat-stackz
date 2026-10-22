import { serve } from '@hono/node-server';
import { createApp } from './app.ts';

const app = createApp(process.env.WEB_ORIGIN);
const server = serve({ fetch: app.fetch, port: 4000 }, (info) => {
  console.log(`BPACKZ API listening on port ${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
    });
  });
}
