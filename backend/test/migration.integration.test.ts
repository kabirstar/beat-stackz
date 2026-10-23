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
test('upload and taxonomy migrations preserve content and backfill defaults safely', { skip: url ? false : 'Requires TEST_DATABASE_URL' }, async () => {
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
    await db.$client.query("INSERT INTO files (id,vault_id,name,blob_sha256,created_by) VALUES ('legacy-file','legacy-vault','beats',$1,'legacy')", [hash]);
    await db.$client.query("INSERT INTO vaults (id,kind,name,created_by) VALUES ('legacy-shared','shared','Existing shared','legacy'), ('deleted-vault','shared','Deleted','legacy')");
    await db.$client.query("UPDATE vaults SET deleted_at='2020-01-01' WHERE id='deleted-vault'");
    await db.$client.query(`INSERT INTO folders (id,vault_id,parent_id,name,updated_at,deleted_at,created_by) VALUES
      ('old-presets','legacy-vault',NULL,'presets','2020-01-01',NULL,'legacy'),
      ('old-plugin','legacy-vault','old-presets','plugin','2020-01-01',NULL,'legacy'),
      ('trashed-vocals','legacy-vault',NULL,'vocals','2020-01-01','2020-01-02','legacy')`);
    await db.$client.query(`CREATE FUNCTION reject_backfill_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action = 'vault.seed_folders' THEN RAISE EXCEPTION 'rollback'; END IF; RETURN NEW; END $$`);
    await db.$client.query('CREATE TRIGGER reject_backfill_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION reject_backfill_audit()');
    try {
      await assert.rejects(migrate(db, { migrationsFolder: source }));
      assert.equal((await db.$client.query("SELECT * FROM information_schema.columns WHERE table_name='folders' AND column_name='kind'")).rowCount, 0);
      assert.equal((await db.$client.query('SELECT * FROM folders')).rowCount, 3);
    } finally {
      await db.$client.query('DROP TRIGGER reject_backfill_audit ON audit_log');
      await db.$client.query('DROP FUNCTION reject_backfill_audit()');
    }
    await migrate(db, { migrationsFolder: source });
    const { rows } = await db.$client.query("SELECT f.status, f.blob_id, b.sha256, b.s3_key, b.verified_at, b.ref_count FROM files f JOIN blobs b ON b.id=f.blob_id WHERE f.id='legacy-file'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, 'ready');
    assert.ok(rows[0].blob_id);
    assert.equal(rows[0].sha256, hash);
    assert.equal(rows[0].s3_key, 'legacy/unchanged-key');
    assert.ok(rows[0].verified_at);
    assert.equal(rows[0].ref_count, 1);
    const preserved = (await db.$client.query("SELECT id, name, kind, updated_at, deleted_at FROM folders WHERE id IN ('old-presets','old-plugin','trashed-vocals') ORDER BY id")).rows;
    assert.equal(preserved.length, 3);
    assert.ok(preserved.every((row) => row.kind === null && row.updated_at.toISOString() === '2020-01-01T00:00:00.000Z'));
    assert.equal(preserved.find((row) => row.id === 'trashed-vocals')!.deleted_at.toISOString(), '2020-01-02T00:00:00.000Z');
    assert.equal((await db.$client.query("SELECT * FROM folders WHERE parent_id='trashed-vocals'")).rowCount, 0);
    assert.equal((await db.$client.query("SELECT * FROM folders WHERE vault_id='legacy-vault' AND name='beats'")).rowCount, 0, 'do not collide with a file');
    const child = (await db.$client.query("SELECT parent_id,kind FROM folders WHERE vault_id='legacy-vault' AND kind='presets/vocals'")).rows[0];
    assert.deepEqual(child, { parent_id: 'old-presets', kind: 'presets/vocals' });
    assert.equal((await db.$client.query("SELECT * FROM folders WHERE vault_id='legacy-shared'")).rowCount, 18);
    assert.equal((await db.$client.query("SELECT * FROM folders WHERE vault_id='deleted-vault'")).rowCount, 0);
    assert.equal((await db.$client.query("SELECT * FROM folders WHERE vault_id='legacy-vault'")).rowCount, 14);
    const seedAudits = (await db.$client.query("SELECT vault_id,meta FROM audit_log WHERE action='vault.seed_folders' ORDER BY vault_id")).rows;
    assert.deepEqual(seedAudits, [
      { vault_id: 'legacy-shared', meta: { count: 18, backfill: true } },
      { vault_id: 'legacy-vault', meta: { count: 11, backfill: true } },
    ]);
    const taxonomyMigration = await readFile(join(source, '0008_powerful_groot.sql'), 'utf8');
    await db.$client.query(taxonomyMigration.split('--> statement-breakpoint').at(-1)!);
    assert.equal((await db.$client.query('SELECT * FROM folders')).rowCount, 32, 'backfill repeat must not add duplicates');
    assert.equal((await db.$client.query("SELECT * FROM audit_log WHERE action='vault.seed_folders'")).rowCount, 2);
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
