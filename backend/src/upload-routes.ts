import { createHash, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { fileAccess } from './share-data.ts';
import { bodyLimit } from 'hono/body-limit';
import { fileRoutes, uploadRoutes, PART_SIZE, type Body } from '@bpackz/shared';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand,
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListPartsCommand, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Database, Transaction } from './db/index.ts';
import type { Storage } from './storage.ts';
import { blobs, files, jobs, uploads, vaultMembers, vaults } from './db/schema.ts';
import { audit, availableName, body, fail, file, fileOut, folder, lockVaults, member, parse, type VaultEnv } from './vault-data.ts';

const TTL_SECONDS = 300;
type Completion = Body<typeof uploadRoutes.complete>;
const requestHash = (input: Completion) => createHash('sha256').update(JSON.stringify({
  key: input.key, folderId: input.folderId, name: input.name, mime: input.mime, sha256: input.sha256,
  parts: [...input.parts].sort((a, b) => a.partNumber - b.partNumber),
})).digest('hex');
const missingObject = (error: unknown) => error instanceof Error && ['NotFound', 'NoSuchKey', 'NoSuchUpload'].includes(error.name);

async function intent(tx: Transaction, vaultId: string, userId: string, id: string, key: string, allowExpired = false) {
  const [row] = await tx.select().from(uploads).where(and(eq(uploads.id, id), eq(uploads.vaultId, vaultId), eq(uploads.userId, userId))).for('update');
  if (!row) fail(404, 'Upload not found');
  if (row.key !== key) fail(400, 'Upload key does not match');
  if (!allowExpired && row.expiresAt.getTime() <= Date.now()) fail(409, 'Upload expired');
  return row;
}
async function completed(tx: Transaction, vaultId: string, userId: string, id: string, input: Completion) {
  const [receipt] = await tx.select({ payload: jobs.payload }).from(jobs)
    .innerJoin(files, and(eq(files.id, jobs.fileId), eq(files.createdBy, userId), eq(files.vaultId, vaultId), isNull(files.deletedAt)))
    .where(and(eq(files.id, id), eq(jobs.kind, 'verify')));
  if (!receipt) return null;
  if (receipt.payload.uploadRequestHash !== requestHash(input)) fail(409, 'Upload already completed with different parameters');
  return fileRoutes.get.response.parse(fileOut(await file(tx, vaultId, id)));
}

export function createUploadRoutes(db: Database, storage: Storage) {
  const app = new Hono<VaultEnv>();
  const { client, presign, bucket: Bucket } = storage;
  app.use('/:vaultId/uploads/*', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: () => fail(400, 'Upload request too large') }));
  app.use('/:vaultId/uploads', bodyLimit({ maxSize: 2 * 1024 * 1024, onError: () => fail(400, 'Upload request too large') }));

  app.post('/:vaultId/uploads', async (c) => {
    const { vaultId } = parse(uploadRoutes.create.params, c.req.param());
    const input = await body(c, uploadRoutes.create.body);
    let started: { Key: string; UploadId: string } | undefined;
    try {
      const result = await db.transaction(async (tx) => {
        await lockVaults(tx, [vaultId]);
        await member(tx, vaultId, c.get('userId'), true);
        if (input.folderId !== null) await folder(tx, vaultId, input.folderId);
        await availableName(tx, vaultId, input.folderId, input.name);
        const [existing] = await tx.select({ blob: blobs }).from(blobs)
          .innerJoin(files, and(eq(files.blobId, blobs.id), eq(files.status, 'ready'), isNull(files.deletedAt)))
          .innerJoin(vaultMembers, and(eq(vaultMembers.vaultId, files.vaultId), eq(vaultMembers.userId, c.get('userId'))))
          .innerJoin(vaults, and(eq(vaults.id, files.vaultId), isNull(vaults.deletedAt)))
          .where(and(eq(blobs.sha256, input.sha256), isNotNull(blobs.verifiedAt))).limit(1).for('update', { of: blobs });
        const id = randomUUID();
        if (existing) {
          if (existing.blob.size !== input.size) fail(409, 'Size does not match verified content');
          await tx.insert(files).values({ id, vaultId, folderId: input.folderId, name: input.name, createdBy: c.get('userId'), blobId: existing.blob.id, status: 'ready' });
          await tx.update(blobs).set({ refCount: sql`${blobs.refCount} + 1` }).where(eq(blobs.id, existing.blob.id));
          await audit(tx, c.get('userId'), vaultId, 'files', id, 'file.create');
          return uploadRoutes.create.response.parse({ dedup: true, file: fileOut(await file(tx, vaultId, id)) });
        }
        const Key = `blobs/${id}`;
        const created = await client.send(new CreateMultipartUploadCommand({ Bucket, Key, ContentType: input.mime ?? 'application/octet-stream', Metadata: { 'upload-id': id } }));
        if (!created.UploadId) throw new Error('Storage did not return an upload id');
        started = { Key, UploadId: created.UploadId };
        await tx.insert(uploads).values({ id, userId: c.get('userId'), vaultId, folderId: input.folderId,
          name: input.name, size: input.size, mime: input.mime, claimedSha256: input.sha256, key: Key,
          multipartId: created.UploadId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
        await audit(tx, c.get('userId'), vaultId, 'uploads', id, 'upload.create');
        return uploadRoutes.create.response.parse({ dedup: false, uploadId: id, key: Key, partSize: PART_SIZE, partCount: Math.ceil(input.size / PART_SIZE) });
      });
      return c.json(result, 201);
    } catch (error) {
      if (started) {
        try { await client.send(new AbortMultipartUploadCommand({ Bucket, ...started })); }
        catch { console.error('Upload creation cleanup failed; storage lifecycle cleanup required'); }
      }
      throw error;
    }
  });

  app.post('/:vaultId/uploads/:uploadId/sign', async (c) => {
    const { vaultId, uploadId } = parse(uploadRoutes.sign.params, c.req.param());
    const input = await body(c, uploadRoutes.sign.body);
    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      const row = await intent(tx, vaultId, c.get('userId'), uploadId, input.key);
      if (row.parts) fail(409, 'Upload completion has started');
      if (row.folderId !== null) await folder(tx, vaultId, row.folderId);
      const count = Math.ceil(row.size / PART_SIZE);
      if (new Set(input.partNumbers).size !== input.partNumbers.length || input.partNumbers.some((n) => n > count)) fail(400, 'Invalid part numbers');
      const expiresIn = Math.min(TTL_SECONDS, Math.floor((row.expiresAt.getTime() - Date.now()) / 1000));
      if (expiresIn < 1) fail(409, 'Upload expired');
      const urls = await Promise.all(input.partNumbers.map(async (partNumber) => ({ partNumber,
        url: await getSignedUrl(presign, new UploadPartCommand({ Bucket, Key: row.key, UploadId: row.multipartId, PartNumber: partNumber }), { expiresIn }),
      })));
      return uploadRoutes.sign.response.parse({ urls, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
    });
    return c.json(result);
  });

  app.post('/:vaultId/uploads/:uploadId/complete', async (c) => {
    const { vaultId, uploadId } = parse(uploadRoutes.complete.params, c.req.param());
    const input = await body(c, uploadRoutes.complete.body);
    // Persist the server-checked manifest before the nontransactional S3 completion.
    const previous = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      const receipt = await completed(tx, vaultId, c.get('userId'), uploadId, input);
      if (receipt) return receipt;
      const row = await intent(tx, vaultId, c.get('userId'), uploadId, input.key);
      if (row.name !== input.name || row.folderId !== input.folderId || row.mime !== input.mime || row.claimedSha256 !== input.sha256) fail(400, 'Completion does not match upload intent');
      if (row.folderId !== null) await folder(tx, vaultId, row.folderId);
      await availableName(tx, vaultId, row.folderId, row.name);
      const count = Math.ceil(row.size / PART_SIZE);
      const supplied = [...input.parts].sort((a, b) => a.partNumber - b.partNumber);
      if (supplied.length !== count || supplied.some((p, i) => p.partNumber !== i + 1 || !p.etag)) fail(400, 'Incomplete or duplicate part manifest');
      if (row.parts) {
        if (row.parts.length !== supplied.length || row.parts.some((p, i) => p.PartNumber !== supplied[i].partNumber || p.ETag !== supplied[i].etag)) fail(409, 'Completion manifest changed');
        return null;
      }
      const manifest: { PartNumber: number; ETag: string }[] = [];
      let marker: string | undefined;
      do {
        const page = await client.send(new ListPartsCommand({ Bucket, Key: row.key, UploadId: row.multipartId, PartNumberMarker: marker }));
        for (const part of page.Parts ?? []) {
          const index = manifest.length;
          const expectedSize = index === count - 1 ? row.size - PART_SIZE * (count - 1) : PART_SIZE;
          if (index >= count || part.PartNumber !== index + 1 || part.Size !== expectedSize || part.ETag !== supplied[index].etag) fail(409, 'Uploaded parts do not match the expected size or ETags');
          manifest.push({ PartNumber: part.PartNumber, ETag: part.ETag });
        }
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
        if (page.IsTruncated && !marker) throw new Error('Storage returned an incomplete part listing');
      } while (marker);
      if (manifest.length !== count) fail(409, 'Parts are missing');
      await tx.update(uploads).set({ parts: manifest }).where(eq(uploads.id, uploadId));
      await audit(tx, c.get('userId'), vaultId, 'uploads', uploadId, 'upload.prepare');
      return null;
    });
    if (previous) return c.json(previous, 201);

    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      const receipt = await completed(tx, vaultId, c.get('userId'), uploadId, input);
      if (receipt) return receipt;
      const row = await intent(tx, vaultId, c.get('userId'), uploadId, input.key);
      if (!row.parts) fail(409, 'Upload was not prepared');
      if (row.folderId !== null) await folder(tx, vaultId, row.folderId);
      await availableName(tx, vaultId, row.folderId, row.name);
      let head;
      try { head = await client.send(new HeadObjectCommand({ Bucket, Key: row.key })); }
      catch (error) { if (!missingObject(error)) throw error; }
      if (!head) {
        await client.send(new CompleteMultipartUploadCommand({ Bucket, Key: row.key, UploadId: row.multipartId, MultipartUpload: { Parts: row.parts } }));
        head = await client.send(new HeadObjectCommand({ Bucket, Key: row.key }));
      }
      if (head.ContentLength !== row.size || head.Metadata?.['upload-id'] !== uploadId) fail(409, 'Completed object does not match the upload intent');
      await tx.insert(blobs).values({ id: uploadId, s3Key: row.key, size: row.size, mime: row.mime, refCount: 1 });
      await tx.insert(files).values({ id: uploadId, vaultId, folderId: row.folderId, name: row.name, blobId: uploadId, createdBy: row.userId, status: 'processing' });
      await tx.insert(jobs).values({ kind: 'verify', fileId: uploadId, payload: { claimedSha256: row.claimedSha256, uploadRequestHash: requestHash(input) } });
      await audit(tx, c.get('userId'), vaultId, 'files', uploadId, 'file.upload_complete');
      await tx.delete(uploads).where(eq(uploads.id, uploadId));
      await audit(tx, c.get('userId'), vaultId, 'uploads', uploadId, 'upload.complete');
      return uploadRoutes.complete.response.parse(fileOut(await file(tx, vaultId, uploadId)));
    });
    return c.json(result, 201);
  });

  app.delete('/:vaultId/uploads/:uploadId', async (c) => {
    const { vaultId, uploadId } = parse(uploadRoutes.abort.params, c.req.param());
    const { key } = parse(uploadRoutes.abort.query, c.req.query());
    await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      const row = await intent(tx, vaultId, c.get('userId'), uploadId, key, true);
      try { await client.send(new AbortMultipartUploadCommand({ Bucket, Key: row.key, UploadId: row.multipartId })); }
      catch (error) { if (!missingObject(error)) throw error; }
      // A prior completion may have reached S3 before its database transaction failed.
      if (row.parts) await client.send(new DeleteObjectCommand({ Bucket, Key: row.key }));
      await tx.delete(uploads).where(eq(uploads.id, uploadId));
      await audit(tx, c.get('userId'), vaultId, 'uploads', uploadId, 'upload.abort');
    });
    return c.body(null, 204);
  });

  app.get('/:vaultId/files/:fileId/download', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.downloadUrl.params, c.req.param());
    const query = parse(fileRoutes.downloadUrl.query, c.req.query());
    const result = await db.transaction(async (tx) => {
      const { current, expiresAt } = await fileAccess(tx, vaultId, fileId, c.get('userId'), false, query.token);
      if (current.status !== 'ready') fail(409, 'File verification is not complete');
      const [blob] = await tx.select({ key: blobs.s3Key, verifiedAt: blobs.verifiedAt }).from(blobs)
        .innerJoin(files, eq(files.blobId, blobs.id)).where(eq(files.id, fileId));
      if (!blob.verifiedAt) fail(409, 'File verification is not complete');
      const expiresIn = expiresAt ? Math.min(TTL_SECONDS, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : TTL_SECONDS;
      if (expiresIn < 1) fail(404, 'Share expired');
      const filename = encodeURIComponent(current.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      const url = await getSignedUrl(presign, new GetObjectCommand({ Bucket, Key: blob.key,
        ResponseContentDisposition: `${query.disposition}; filename*=UTF-8''${filename}` }), { expiresIn });
      await audit(tx, c.get('userId') || null, vaultId, 'files', fileId, 'file.download');
      return fileRoutes.downloadUrl.response.parse({ url, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() });
    });
    return c.json(result);
  });
  app.get('/:vaultId/files/:fileId/waveform', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.waveform.params, c.req.param());
    const query = parse(fileRoutes.waveform.query, c.req.query());
    const result = await db.transaction(async (tx) => {
      const { current } = await fileAccess(tx, vaultId, fileId, c.get('userId'), false, query.token);
      if (current.status !== 'ready') fail(409, 'File verification is not complete');
      const [blob] = await tx.select({ waveform: blobs.waveform, verifiedAt: blobs.verifiedAt }).from(blobs)
        .innerJoin(files, eq(files.blobId, blobs.id)).where(eq(files.id, fileId));
      if (!blob.verifiedAt) fail(409, 'File verification is not complete');
      if (!blob.waveform) fail(404, 'No waveform available');
      return fileRoutes.waveform.response.parse(blob.waveform);
    });
    return c.json(result);
  });
  return app;
}
