import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAuth } from './auth.ts';
import { readConfig } from './config.ts';
import { createDatabase } from './db/index.ts';

const config = readConfig();
const db = createDatabase(config.databaseUrl);
const app = createApp(config.webOrigin, createAuth(db, config));
const server = serve({ fetch: app.fetch, port: 4000 }, (info) => {
  console.log(`BPACKZ API listening on port ${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(async (error) => {
      if (error) {
        console.error(error);
        process.exitCode = 1;
      }
      await db.$client.end();
    });
  });
}
