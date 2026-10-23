import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Database } from '../../backend/src/db/index.ts';
import { auditLog, blobs, files, folders, jobs, shares, vaults } from '../../backend/src/db/schema.ts';
import type { Storage } from '../../backend/src/storage.ts';

export async function purgeOne(db: Database, storage: Storage, signal?: AbortSignal): Promise<boolean> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return db.transaction(async (tx) => {
    signal?.throwIfAborted();
    const [candidate] = await tx.select({ file: files }).from(files).innerJoin(vaults, eq(vaults.id, files.vaultId))
      .where(lte(files.deletedAt, cutoff)).orderBy(asc(files.deletedAt), asc(files.id)).limit(1)
      .for('update', { of: vaults, skipLocked: true });
    if (candidate) {
      // Verification takes job then vault: skip its locked job rather than invert that lock order.
      const receipts = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.fileId, candidate.file.id));
      const locked = await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.fileId, candidate.file.id))
        .for('update', { skipLocked: true });
      if (receipts.length !== locked.length) return false;
      const grants = await tx.select({ id: shares.id }).from(shares).where(eq(shares.fileId, candidate.file.id));
      const [released] = await tx.update(blobs).set({ refCount: sql`${blobs.refCount} - 1` })
        .where(and(eq(blobs.id, candidate.file.blobId), sql`${blobs.refCount} > 0`)).returning({ id: blobs.id });
      if (!released) throw new Error('Purge reference count invariant failed');
      await tx.insert(auditLog).values([
        { vaultId: candidate.file.vaultId, targetType: 'files', targetId: candidate.file.id, action: 'file.purge' },
        { targetType: 'blobs', targetId: released.id, action: 'blob.release' },
        ...grants.map((row) => ({ targetType: 'shares', targetId: row.id, action: 'share.purge' })),
        ...receipts.map((row) => ({ targetType: 'jobs', targetId: String(row.id), action: 'job.purge' })),
      ]);
      await tx.delete(files).where(eq(files.id, candidate.file.id));
      return true;
    }
    const [emptyFolder] = await tx.select({ folder: folders }).from(folders).innerJoin(vaults, eq(vaults.id, folders.vaultId))
      .where(and(lte(folders.deletedAt, cutoff),
        sql`not exists (select 1 from folders child where child.vault_id = ${folders.vaultId} and child.parent_id = ${folders.id})`,
        sql`not exists (select 1 from files where files.vault_id = ${folders.vaultId} and files.folder_id = ${folders.id})`,
        sql`not exists (select 1 from uploads where uploads.folder_id = ${folders.id})`))
      .orderBy(asc(folders.deletedAt), asc(folders.id)).limit(1).for('update', { of: vaults, skipLocked: true });
    if (emptyFolder) {
      await tx.delete(folders).where(eq(folders.id, emptyFolder.folder.id));
      await tx.insert(auditLog).values({ vaultId: emptyFolder.folder.vaultId, targetType: 'folders', targetId: emptyFolder.folder.id, action: 'folder.purge' });
      return true;
    }
    const [orphan] = await tx.select().from(blobs).where(and(eq(blobs.refCount, 0),
      sql`not exists (select 1 from files join blobs b on b.id = files.blob_id where b.s3_key = ${blobs.s3Key})`))
      .orderBy(asc(blobs.id)).limit(1).for('update', { skipLocked: true });
    if (!orphan) return false;
    // The locked zero-ref row is the retry receipt if S3 succeeds but SQL rolls back.
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: orphan.s3Key }), { abortSignal: signal });
    signal?.throwIfAborted();
    await tx.delete(blobs).where(eq(blobs.id, orphan.id));
    await tx.insert(auditLog).values({ targetType: 'blobs', targetId: orphan.id, action: 'blob.purge' });
    return true;
  });
}
