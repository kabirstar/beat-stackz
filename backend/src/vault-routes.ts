import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ApiError, Id, fileRoutes, folderRoutes, vaultRoutes } from '@bpackz/shared';
import { and, asc, eq, gt, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import type { Auth } from './auth.ts';
import type { Database, Transaction } from './db/index.ts';
import { auditLog, blobs, files, folders, users, vaultMembers, vaults } from './db/schema.ts';

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: unknown } };
const errors = { 400: 'invalid', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict' } as const;
function fail(status: keyof typeof errors, message: string): never {
  throw new HTTPException(status, { res: Response.json(ApiError.parse({ error: errors[status], message }), { status }) });
}
function parse<T>(schema: Schema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail(400, 'Invalid request');
  return result.data;
}
async function body<T>(context: Context, schema: Schema<T>): Promise<T> {
  let input: unknown;
  try { input = await context.req.json(); } catch { fail(400, 'Invalid JSON'); }
  return parse(schema, input);
}
const atParent = (column: typeof folders.parentId | typeof files.folderId, id: string | null) => id === null ? isNull(column) : eq(column, id);
const folderOut = (row: typeof folders.$inferSelect) => ({ ...row, updatedAt: row.updatedAt.toISOString() });
const vaultOut = (row: typeof vaults.$inferSelect, role: string) => ({ ...row, myRole: role, createdAt: row.createdAt.toISOString() });
const fileSelection = {
  id: files.id, vaultId: files.vaultId, folderId: files.folderId, name: files.name,
  size: blobs.size, mime: blobs.mime, sha256: blobs.sha256, durationMs: blobs.durationMs,
  hasWaveform: sql<boolean>`${blobs.waveform} is not null`, createdBy: files.createdBy,
  createdAt: files.createdAt, updatedAt: files.updatedAt,
};
const fileOut = <T extends { createdAt: Date; updatedAt: Date }>(row: T) => ({
  ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
const nextVersion = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1));

// shortcut: serialize mutations per vault; use finer locks if measured contention warrants it.
// Sorted locks also protect cross-vault moves from deadlocks.
async function lockVaults(tx: Transaction, ids: string[]) {
  await tx.select({ id: vaults.id }).from(vaults).where(inArray(vaults.id, [...new Set(ids)]))
    .orderBy(asc(vaults.id)).for('update');
}
async function member(tx: Transaction, vaultId: string, userId: string, write = false) {
  const [row] = await tx.select({ vault: vaults, role: vaultMembers.role }).from(vaults)
    .innerJoin(vaultMembers, and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, userId)))
    .innerJoin(users, and(eq(users.id, userId), isNull(users.deletedAt)))
    .where(and(eq(vaults.id, vaultId), isNull(vaults.deletedAt)));
  if (!row) fail(403, 'Vault access denied');
  if (write && row.role === 'viewer') fail(403, 'Editor access required');
  return row;
}
async function folder(tx: Transaction, vaultId: string, id: string) {
  const [row] = await tx.select().from(folders).where(and(eq(folders.id, id), eq(folders.vaultId, vaultId), isNull(folders.deletedAt)));
  if (!row) fail(404, 'Folder not found');
  return row;
}
async function file(tx: Transaction, vaultId: string, id: string) {
  const [row] = await tx.select(fileSelection).from(files).innerJoin(blobs, eq(blobs.sha256, files.blobSha256))
    .where(and(eq(files.id, id), eq(files.vaultId, vaultId), isNull(files.deletedAt)));
  if (!row) fail(404, 'File not found');
  return row;
}
async function availableName(tx: Transaction, vaultId: string, parentId: string | null, name: string, exceptId = '') {
  const [existingFolder] = await tx.select({ id: folders.id }).from(folders).where(and(
    eq(folders.vaultId, vaultId), atParent(folders.parentId, parentId), eq(folders.name, name),
    ne(folders.id, exceptId), isNull(folders.deletedAt))).limit(1);
  const [existingFile] = await tx.select({ id: files.id }).from(files).where(and(
    eq(files.vaultId, vaultId), atParent(files.folderId, parentId), eq(files.name, name),
    ne(files.id, exceptId), isNull(files.deletedAt))).limit(1);
  if (existingFolder || existingFile) fail(409, 'Name already exists in this folder');
}
async function audit(tx: Transaction, actorId: string, vaultId: string, targetType: string, targetId: string, action: string) {
  await tx.insert(auditLog).values({ actorId, vaultId, targetType, targetId, action });
}
const subtree = (vaultId: string, folderId: string) => sql`
  WITH RECURSIVE tree AS (
    SELECT id FROM folders WHERE id = ${folderId} AND vault_id = ${vaultId} AND deleted_at IS NULL
    UNION
    SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
    WHERE f.vault_id = ${vaultId} AND f.deleted_at IS NULL
  )`;

export function createVaultRoutes(auth: Auth, db: Database, webOrigin: string) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.onError((error, context) => {
    if (error instanceof HTTPException) return error.getResponse();
    // Database errors may contain private names and parameters; never return or log them.
    const cause = error.cause as { code?: string } | undefined;
    if (cause?.code === '23505') return context.json(ApiError.parse({ error: 'conflict', message: 'Name already exists' }), 409);
    return context.text('Internal server error', 500);
  });
  app.use('*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(context.req.method)) {
      const origin = context.req.header('Origin');
      if ((origin && origin !== webOrigin) || (!origin && context.req.header('Sec-Fetch-Site') === 'cross-site')) fail(403, 'Untrusted origin');
    }
    const session = await auth.api.getSession({ headers: context.req.raw.headers });
    if (!session) fail(401, 'Sign in required');
    const [active] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, session.user.id), isNull(users.deletedAt)));
    if (!active) fail(403, 'Account unavailable');
    context.set('userId', active.id);
    await next();
  });

  app.get('/', async (c) => {
    const rows = await db.select({ vault: vaults, role: vaultMembers.role }).from(vaults)
      .innerJoin(vaultMembers, and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, c.get('userId'))))
      .where(isNull(vaults.deletedAt)).orderBy(asc(vaults.id));
    return c.json(vaultRoutes.list.response.parse({ items: rows.map((r) => vaultOut(r.vault, r.role)) }));
  });
  app.post('/', async (c) => {
    const input = await body(c, vaultRoutes.create.body);
    const result = await db.transaction(async (tx) => {
      const [created] = await tx.insert(vaults).values({ id: randomUUID(), kind: 'shared', name: input.name, createdBy: c.get('userId') }).returning();
      await tx.insert(vaultMembers).values({ vaultId: created.id, userId: c.get('userId'), role: 'owner' });
      await audit(tx, c.get('userId'), created.id, 'vaults', created.id, 'vault.create');
      await audit(tx, c.get('userId'), created.id, 'vault_members', c.get('userId'), 'member.add');
      return vaultRoutes.create.response.parse(vaultOut(created, 'owner'));
    });
    return c.json(result, 201);
  });
  app.get('/:vaultId', async (c) => {
    const { vaultId } = parse(vaultRoutes.get.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      const row = await member(tx, vaultId, c.get('userId'));
      return vaultRoutes.get.response.parse(vaultOut(row.vault, row.role));
    });
    return c.json(result);
  });
  app.patch('/:vaultId', async (c) => {
    const { vaultId } = parse(vaultRoutes.rename.params, c.req.param());
    const input = await body(c, vaultRoutes.rename.body);
    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      const row = await member(tx, vaultId, c.get('userId'));
      if (row.role !== 'owner') fail(403, 'Owner access required');
      const [updated] = await tx.update(vaults).set({ name: input.name }).where(eq(vaults.id, vaultId)).returning();
      await audit(tx, c.get('userId'), vaultId, 'vaults', vaultId, 'vault.rename');
      return vaultRoutes.rename.response.parse(vaultOut(updated, row.role));
    });
    return c.json(result);
  });

  app.post('/:vaultId/folders', async (c) => {
    const { vaultId } = parse(folderRoutes.create.params, c.req.param());
    const input = await body(c, folderRoutes.create.body);
    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      if (input.parentId !== null) await folder(tx, vaultId, input.parentId);
      await availableName(tx, vaultId, input.parentId, input.name);
      const [created] = await tx.insert(folders).values({ ...input, id: randomUUID(), vaultId, createdBy: c.get('userId') }).returning();
      await audit(tx, c.get('userId'), vaultId, 'folders', created.id, 'folder.create');
      return folderRoutes.create.response.parse(folderOut(created));
    });
    return c.json(result, 201);
  });
  app.get('/:vaultId/folders/:folderId', async (c) => {
    const { vaultId, folderId } = parse(folderRoutes.get.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      await member(tx, vaultId, c.get('userId'));
      const current = await folder(tx, vaultId, folderId);
      const ancestors = await tx.execute(sql`WITH RECURSIVE ancestors AS (
        SELECT id, name, parent_id, 0 AS depth, ARRAY[id] AS visited FROM folders WHERE id = ${folderId} AND vault_id = ${vaultId}
        UNION ALL
        SELECT f.id, f.name, f.parent_id, a.depth + 1, a.visited || f.id FROM folders f JOIN ancestors a ON f.id = a.parent_id
        WHERE f.vault_id = ${vaultId} AND f.deleted_at IS NULL AND NOT f.id = ANY(a.visited)
      ) SELECT id, name FROM ancestors ORDER BY depth DESC`);
      return folderRoutes.get.response.parse({ folder: folderOut(current), breadcrumb: ancestors.rows });
    });
    return c.json(result);
  });
  app.patch('/:vaultId/folders/:folderId', async (c) => {
    const { vaultId, folderId } = parse(folderRoutes.update.params, c.req.param());
    const input = await body(c, folderRoutes.update.body);
    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      const current = await folder(tx, vaultId, folderId);
      if (current.updatedAt.getTime() !== Date.parse(input.ifUpdatedAt)) fail(409, 'Folder changed; refresh before retrying');
      const parentId = input.parentId === undefined ? current.parentId : input.parentId;
      if (parentId !== null) {
        await folder(tx, vaultId, parentId);
        const cycle = await tx.execute(sql`${subtree(vaultId, folderId)} SELECT id FROM tree WHERE id = ${parentId}`);
        if (cycle.rowCount) fail(409, 'Cannot move a folder into its own subtree');
      }
      const name = input.name ?? current.name;
      await availableName(tx, vaultId, parentId, name, folderId);
      const [updated] = await tx.update(folders).set({ parentId, name, updatedAt: nextVersion(current.updatedAt) })
        .where(eq(folders.id, folderId)).returning();
      await audit(tx, c.get('userId'), vaultId, 'folders', folderId, 'folder.update');
      return folderRoutes.update.response.parse(folderOut(updated));
    });
    return c.json(result);
  });
  app.delete('/:vaultId/folders/:folderId', async (c) => {
    const { vaultId, folderId } = parse(folderRoutes.trash.params, c.req.param());
    await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      await folder(tx, vaultId, folderId);
      await tx.execute(sql`${subtree(vaultId, folderId)}, removed_folders AS (
        UPDATE folders SET deleted_at = now(), updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
        WHERE id IN (SELECT id FROM tree) RETURNING id
      ), removed_files AS (
        UPDATE files SET deleted_at = now(), updated_at = greatest(clock_timestamp(), updated_at + interval '1 millisecond')
        WHERE vault_id = ${vaultId} AND folder_id IN (SELECT id FROM tree) AND deleted_at IS NULL RETURNING id
      ) INSERT INTO audit_log (actor_id, vault_id, target_type, target_id, action)
        SELECT ${c.get('userId')}, ${vaultId}, 'folders', id, 'folder.trash' FROM removed_folders
        UNION ALL SELECT ${c.get('userId')}, ${vaultId}, 'files', id, 'file.trash' FROM removed_files`);
    });
    return c.body(null, 204);
  });

  app.get('/:vaultId/children', async (c) => {
    const { vaultId } = parse(fileRoutes.listChildren.params, c.req.param());
    const query = parse(fileRoutes.listChildren.query, c.req.query());
    const cursor = query.cursor === undefined ? undefined : parse(Id, query.cursor);
    const result = await db.transaction(async (tx) => {
      await member(tx, vaultId, c.get('userId'));
      const parentId = query.folderId ?? null;
      if (parentId !== null) await folder(tx, vaultId, parentId);
      const children = await tx.select().from(folders).where(and(eq(folders.vaultId, vaultId), atParent(folders.parentId, parentId), isNull(folders.deletedAt)))
        .orderBy(asc(folders.name), asc(folders.id));
      const conditions: (SQL | undefined)[] = [eq(files.vaultId, vaultId), atParent(files.folderId, parentId), isNull(files.deletedAt)];
      if (cursor !== undefined) conditions.push(gt(files.id, cursor));
      const page = await tx.select(fileSelection).from(files).innerJoin(blobs, eq(blobs.sha256, files.blobSha256))
        .where(and(...conditions)).orderBy(asc(files.id)).limit(query.limit + 1);
      return fileRoutes.listChildren.response.parse({ folders: children.map(folderOut), files: page.slice(0, query.limit).map(fileOut),
        nextCursor: page.length > query.limit ? page[query.limit - 1].id : null });
    });
    return c.json(result);
  });
  app.get('/:vaultId/files/:fileId', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.get.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      await member(tx, vaultId, c.get('userId'));
      return fileRoutes.get.response.parse(fileOut(await file(tx, vaultId, fileId)));
    });
    return c.json(result);
  });
  app.patch('/:vaultId/files/:fileId', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.update.params, c.req.param());
    const input = await body(c, fileRoutes.update.body);
    const result = await db.transaction(async (tx) => {
      const destination = input.toVaultId ?? vaultId;
      await lockVaults(tx, [vaultId, destination]);
      await member(tx, vaultId, c.get('userId'), true);
      if (destination !== vaultId) await member(tx, destination, c.get('userId'), true);
      const current = await file(tx, vaultId, fileId);
      if (current.updatedAt.getTime() !== Date.parse(input.ifUpdatedAt)) fail(409, 'File changed; refresh before retrying');
      const folderId = input.folderId === undefined ? (input.toVaultId ? null : current.folderId) : input.folderId;
      if (folderId !== null) await folder(tx, destination, folderId);
      const name = input.name ?? current.name;
      await availableName(tx, destination, folderId, name, fileId);
      await tx.update(files).set({ vaultId: destination, folderId, name, updatedAt: nextVersion(current.updatedAt) }).where(eq(files.id, fileId));
      await audit(tx, c.get('userId'), vaultId, 'files', fileId, 'file.update');
      if (destination !== vaultId) await audit(tx, c.get('userId'), destination, 'files', fileId, 'file.move_in');
      return fileRoutes.update.response.parse(fileOut(await file(tx, destination, fileId)));
    });
    return c.json(result);
  });
  app.delete('/:vaultId/files/:fileId', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.trash.params, c.req.param());
    await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      const current = await file(tx, vaultId, fileId);
      await tx.update(files).set({ deletedAt: new Date(), updatedAt: nextVersion(current.updatedAt) }).where(eq(files.id, fileId));
      await audit(tx, c.get('userId'), vaultId, 'files', fileId, 'file.trash');
    });
    return c.body(null, 204);
  });
  return app;
}
