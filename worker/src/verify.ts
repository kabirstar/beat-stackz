import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { AbortMultipartUploadCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import type { Database, Transaction } from '../../backend/src/db/index.ts';
import { auditLog, blobs, files, jobs, uploads, vaults } from '../../backend/src/db/schema.ts';
import type { Storage } from '../../backend/src/storage.ts';
import { lockVaults, nextVersion } from '../../backend/src/vault-data.ts';
import { startAudio, type AudioMetadata } from './audio.ts';

type Job = typeof jobs.$inferSelect;
async function auditJob(tx: Transaction, job: Job, action: string) {
  await tx.insert(auditLog).values({ targetType: 'jobs', targetId: String(job.id), action });
}
async function retry(tx: Transaction, job: Job, error: string) {
  await tx.update(jobs).set({ state: 'queued', attempts: job.attempts + 1, lastError: error,
    runAfter: new Date(Date.now() + Math.min(300_000, 5000 * 2 ** Math.min(job.attempts, 6))) }).where(eq(jobs.id, job.id));
  await auditJob(tx, job, 'job.verify_retry');
}

export async function verifyOne(db: Database, storage: Storage, signal?: AbortSignal): Promise<boolean> {
  let claimed: Job | undefined;
  try {
    return await db.transaction(async (tx) => {
      // shortcut: one job lock/connection during streaming; add leases if measured concurrency needs them.
      // A process crash releases the lock and rolls back the claim, so no job can be stranded running.
      const [job] = await tx.select().from(jobs).where(and(eq(jobs.kind, 'verify'), eq(jobs.state, 'queued'), lte(jobs.runAfter, new Date())))
        .orderBy(asc(jobs.runAfter), asc(jobs.id)).limit(1).for('update', { skipLocked: true });
      if (!job) return false;
      claimed = job;
      signal?.throwIfAborted();
      const { client, bucket: Bucket } = storage;
      if (job.payload.cleanup) {
        const { key: Key, outcome, error } = job.payload.cleanup;
        try { await client.send(new DeleteObjectCommand({ Bucket, Key }), { abortSignal: signal }); }
        catch {
          signal?.throwIfAborted();
          await retry(tx, job, 'storage_cleanup_failed');
          return true;
        }
        const { cleanup: _cleanup, ...receipt } = job.payload;
        await tx.update(jobs).set({ state: receipt.audioPending ? 'queued' : outcome, payload: receipt,
          lastError: error ?? (receipt.audioAttempts ? 'audio_analysis_failed' : null), attempts: job.attempts + 1,
          runAfter: new Date(Date.now() + (receipt.audioPending ? 5000 * 2 ** (receipt.audioAttempts ?? 0) : 0)) }).where(eq(jobs.id, job.id));
        await auditJob(tx, job, 'job.verify_cleanup');
        return true;
      }

      const [source] = await tx.select({ blob: blobs }).from(files).innerJoin(blobs, eq(blobs.id, files.blobId)).where(eq(files.id, job.fileId));
      if (!source) throw new Error('Verification file is missing');
      let digest = '';
      let size = 0;
      let failure: string | null = null;
      let audio: AudioMetadata | null = null;
      let audioError = false;
      try {
        const object = await client.send(new GetObjectCommand({ Bucket, Key: source.blob.s3Key }), { abortSignal: signal });
        if (!(object.Body instanceof Readable)) throw new Error('Missing object stream');
        const hash = createHash('sha256');
        const analysis = source.blob.waveform ? null : startAudio(signal);
        try {
          for await (const chunk of object.Body) {
            signal?.throwIfAborted();
            size += chunk.length;
            if (size > source.blob.size) { failure = 'size_mismatch'; break; }
            hash.update(chunk);
            await analysis?.write(chunk);
          }
        } catch (error) {
          analysis?.cancel();
          throw error;
        } finally {
          object.Body.destroy();
          try { audio = await analysis?.finish() ?? null; }
          catch { signal?.throwIfAborted(); audioError = true; }
        }
        digest = hash.digest('hex');
        if (size !== source.blob.size) failure = 'size_mismatch';
        else if (digest !== job.payload.claimedSha256) failure = 'hash_mismatch';
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && ['NoSuchKey', 'NotFound'].includes(error.name)) failure = 'object_missing';
        else { await retry(tx, job, 'storage_read_failed'); return true; }
      }
      signal?.throwIfAborted();
      const payload = { ...job.payload };
      if (audioError) payload.audioAttempts = (payload.audioAttempts ?? 0) + 1;
      else delete payload.audioAttempts;
      payload.audioPending = !failure && audioError && (payload.audioAttempts ?? 0) < 3;
      const audioRetryAt = new Date(Date.now() + (payload.audioPending ? 5000 * 2 ** (payload.audioAttempts ?? 0) : 0));

      const [location] = await tx.select({ vaultId: files.vaultId }).from(files).where(eq(files.id, job.fileId));
      if (!location) throw new Error('Verification file is missing');
      await lockVaults(tx, [location.vaultId]);
      const [current] = await tx.select().from(files).where(eq(files.id, job.fileId)).for('update');
      if (!current || current.vaultId !== location.vaultId || current.blobId !== source.blob.id) {
        await retry(tx, job, 'file_moved_during_verification');
        return true;
      }
      // A requeued receipt for an already verified file must not change references or delete its shared object.
      if (source.blob.verifiedAt) {
        if (failure || source.blob.sha256 !== digest) throw new Error('Previously verified object changed');
        if (audio) await tx.update(blobs).set(audio).where(and(eq(blobs.id, source.blob.id), sql`${blobs.waveform} is null`));
        await tx.update(jobs).set({ state: payload.audioPending ? 'queued' : 'done', payload, runAfter: audioRetryAt,
          attempts: job.attempts + 1, lastError: audioError ? 'audio_analysis_failed' : null }).where(eq(jobs.id, job.id));
        await auditJob(tx, job, 'job.verify_replayed');
        return true;
      }
      let targetId = current.blobId;
      if (failure) {
        payload.cleanup = { key: source.blob.s3Key, outcome: 'failed', error: failure };
      } else {
        // Serialize only the hash promotion, after streaming, to resolve simultaneous first uploads.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${digest}, 0))`);
        const [existing] = await tx.select().from(blobs).where(and(eq(blobs.sha256, digest), isNotNull(blobs.verifiedAt))).for('update');
        if (existing && existing.id !== source.blob.id) {
          if (existing.size !== size) throw new Error('Verified blob size conflict');
          targetId = existing.id;
          await tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1` }).where(eq(blobs.id, targetId));
          await tx.update(blobs).set({ refCount: sql`${blobs.refCount} - 1` }).where(eq(blobs.id, source.blob.id));
          payload.cleanup = { key: source.blob.s3Key, outcome: 'done', error: null };
        } else {
          await tx.update(blobs).set({ sha256: digest, verifiedAt: new Date() }).where(eq(blobs.id, source.blob.id));
        }
      }
      if (!failure && audio) await tx.update(blobs).set(audio).where(and(eq(blobs.id, targetId), sql`${blobs.waveform} is null`));
      // Commit the decision/cleanup receipt before deleting bytes; retries can then finish without re-hashing a deleted key.
      await tx.update(files).set({ status: failure ? 'failed' : 'ready', blobId: targetId, updatedAt: nextVersion(current.updatedAt) }).where(eq(files.id, current.id));
      await tx.update(jobs).set({ state: payload.cleanup || payload.audioPending ? 'queued' : 'done', payload, attempts: job.attempts + 1,
        lastError: failure ?? (audioError ? 'audio_analysis_failed' : null), runAfter: payload.cleanup ? new Date() : audioRetryAt }).where(eq(jobs.id, job.id));
      await tx.insert(auditLog).values({ vaultId: current.vaultId, targetType: 'files', targetId: current.id,
        action: failure ? 'file.verify_failed' : 'file.verified', meta: { jobId: String(job.id), dedup: targetId !== source.blob.id,
          error: failure, audioError, hasWaveform: !failure && Boolean(audio) } });
      return true;
    });
  } catch (error) {
    if (claimed && !signal?.aborted) {
      const failed = claimed;
      // A failed transaction releases its claim; don't overwrite work another runner has since completed.
      await db.transaction(async (tx) => {
        const [job] = await tx.select().from(jobs).where(and(eq(jobs.id, failed.id), eq(jobs.state, 'queued')))
          .for('update', { skipLocked: true });
        if (job && job.attempts === failed.attempts) await retry(tx, job, 'verification_transaction_failed');
      });
    }
    throw error;
  }
}

export async function expireOne(db: Database, storage: Storage, signal?: AbortSignal): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Match API lock order: vault before intent. Skip busy vaults instead of delaying uploads.
    const [candidate] = await tx.select({ id: uploads.id }).from(uploads).innerJoin(vaults, eq(vaults.id, uploads.vaultId))
      .where(lte(uploads.expiresAt, new Date())).orderBy(asc(uploads.expiresAt)).limit(1).for('update', { of: vaults, skipLocked: true });
    if (!candidate) return false;
    const [row] = await tx.select().from(uploads).where(eq(uploads.id, candidate.id)).for('update');
    if (!row || row.expiresAt.getTime() > Date.now()) return false;
    const { client, bucket: Bucket } = storage;
    try { await client.send(new AbortMultipartUploadCommand({ Bucket, Key: row.key, UploadId: row.multipartId }), { abortSignal: signal }); }
    catch (error) { if (!(error instanceof Error) || error.name !== 'NoSuchUpload') throw error; }
    if (row.parts) await client.send(new DeleteObjectCommand({ Bucket, Key: row.key }), { abortSignal: signal });
    await tx.delete(uploads).where(eq(uploads.id, row.id));
    await tx.insert(auditLog).values({ vaultId: row.vaultId, targetType: 'uploads', targetId: row.id, action: 'upload.expired' });
    return true;
  });
}
