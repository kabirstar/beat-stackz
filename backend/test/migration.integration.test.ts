import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/db/index.ts';

const url = process.env.TEST_DATABASE_URL;
test('upload migration preserves existing files, verified hashes and object keys', { skip: url ? false : 'Requires TEST_DATABASE_URL' }, async () => {
  assert.ok(url);
  assert.match(new URL(url).pathname, /\/[^/]+_test$/);
  const admin = createDatabase(url);
  const databaseName = `bpackz_upgrade_${randomUUID().replaceAll('-', '')}_test`;
  assert.match(databaseName, /^[a-z0-9_]+$/);
  const isolatedUrl = new URL(url);
  isolatedUrl.pathname = `/${databaseName}`;
  const db = createDatabase(isolatedUrl.toString());
  const directory = await mkdtemp(join(tmpdir(), 'bpackz-migration-'));
  const source = fileURLToPath(new URL('../drizzle', import.meta.url));
  let created = false;
  try {
    await admin.$client.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    await mkdir(join(directory, 'meta'));
    const journal = JSON.parse(await readFile(join(source, 'meta', '_journal.json'), 'utf8'));
    journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 4);
    await writeFile(join(directory, 'meta', '_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) await copyFile(join(source, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
    await migrate(db, { migrationsFolder: directory });
    const hash = createHash('sha256').update('legacy fixture').digest('hex');
    await db.$client.query("INSERT INTO users (id,email,name) VALUES ('legacy','legacy@example.com','Legacy')");
    await db.$client.query("INSERT INTO vaults (id,kind,name,created_by) VALUES ('legacy-vault','personal','My vault','legacy')");
    await db.$client.query('INSERT INTO blobs (sha256,s3_key,size,ref_count) VALUES ($1,$2,14,1)', [hash, 'legacy/unchanged-key']);
    await db.$client.query("INSERT INTO files (id,vault_id,name,blob_sha256,created_by) VALUES ('legacy-file','legacy-vault','legacy.bin',$1,'legacy')", [hash]);
    await migrate(db, { migrationsFolder: source });
    const { rows } = await db.$client.query("SELECT f.status, f.blob_id, b.sha256, b.s3_key, b.verified_at, b.ref_count FROM files f JOIN blobs b ON b.id=f.blob_id WHERE f.id='legacy-file'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'ready');
    assert.ok(rows[0].blob_id);
    assert.equal(rows[0].sha256, hash);
    assert.equal(rows[0].s3_key, 'legacy/unchanged-key');
    assert.ok(rows[0].verified_at);
    assert.equal(rows[0].ref_count, 1);
  } finally {
    await db.$client.end();
    try { if (created) await admin.$client.query(`DROP DATABASE "${databaseName}"`); }
    finally {
      await admin.$client.end();
      assert.ok(directory.startsWith(join(tmpdir(), 'bpackz-migration-')));
      await rm(directory, { recursive: true });
    }
  }
});
