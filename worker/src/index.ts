import { setTimeout } from 'node:timers/promises';
import { createDatabase } from '../../backend/src/db/index.ts';
import { createStorage } from '../../backend/src/storage.ts';
import { expireOne, verifyOne } from './verify.ts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const storage = createStorage();
const db = createDatabase(process.env.DATABASE_URL);
const stop = new AbortController();
const shutdown = () => stop.abort();
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
console.log('Verification worker started');
try {
  while (!stop.signal.aborted) {
    let worked = false;
    try {
      worked = await verifyOne(db, storage, stop.signal);
      worked = await expireOne(db, storage, stop.signal) || worked;
    } catch {
      if (stop.signal.aborted) break;
      console.error('Worker operation failed; retrying in five seconds');
      worked = false;
    }
    if (!worked) {
      try { await setTimeout(5000, undefined, { signal: stop.signal }); }
      catch { if (!stop.signal.aborted) throw new Error('Worker wait failed'); }
    }
  }
} finally {
  process.removeListener('SIGINT', shutdown);
  process.removeListener('SIGTERM', shutdown);
  storage.client.destroy();
  await db.$client.end();
}
