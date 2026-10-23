import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ApiError, Id, fileRoutes, folderRoutes, vaultRoutes } from '@bpackz/shared';
import { and, asc, eq, gt, isNull, sql, type SQL } from 'drizzle-orm';
import { createMemberRoutes } from './member-routes.ts';
import { seedDefaultFolders } from './default-folders.ts';
import { createShareRoutes } from './share-routes.ts';
import { fileAccess } from './share-data.ts';
import { createUploadRoutes } from './upload-routes.ts';
import type { Storage } from './storage.ts';
import { fail, parse, body, atParent, folderOut, vaultOut, fileSelection, fileOut, nextVersion, lockVaults, member, folder, file, availableName, audit, subtree } from './vault-data.ts';
import type { Auth } from './auth.ts';
import type { Database } from './db/index.ts';
import { blobs, files, folders, users, vaultMembers, vaults } from './db/schema.ts';

export function createVaultRoutes(auth: Auth, db: Database, webOrigin: string, storage?: Storage) {
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
    const tokenRead = context.req.method === 'GET' && /^\/vaults\/[^/]+\/files\/[^/]+\/(?:download|waveform)$/.test(context.req.path) && context.req.query('token') !== undefined;
    if (!session) {
      if (!tokenRead) fail(401, 'Sign in required');
      context.set('userId', '');
      await next();
      return;
    }
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
      await seedDefaultFolders(tx, created.id, c.get('userId'));
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
      const page = await tx.select(fileSelection).from(files).innerJoin(blobs, eq(blobs.id, files.blobId))
        .where(and(...conditions)).orderBy(asc(files.id)).limit(query.limit + 1);
      return fileRoutes.listChildren.response.parse({ folders: children.map(folderOut), files: page.slice(0, query.limit).map(fileOut),
        nextCursor: page.length > query.limit ? page[query.limit - 1].id : null });
    });
    return c.json(result);
  });
  app.get('/:vaultId/files/:fileId', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.get.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      const access = await fileAccess(tx, vaultId, fileId, c.get('userId'));
      return fileRoutes.get.response.parse(fileOut(access.current));
    });
    return c.json(result);
  });
  app.patch('/:vaultId/files/:fileId', async (c) => {
    const { vaultId, fileId } = parse(fileRoutes.update.params, c.req.param());
    const input = await body(c, fileRoutes.update.body);
    const result = await db.transaction(async (tx) => {
      const destination = input.toVaultId ?? vaultId;
      await lockVaults(tx, [vaultId, destination]);
      const access = await fileAccess(tx, vaultId, fileId, c.get('userId'), true);
      if (input.folderId !== undefined || input.toVaultId !== undefined) await member(tx, vaultId, c.get('userId'), true);
      if (destination !== vaultId) await member(tx, destination, c.get('userId'), true);
      const current = access.current;
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
      const { current } = await fileAccess(tx, vaultId, fileId, c.get('userId'), true);
      await tx.update(files).set({ deletedAt: new Date(), updatedAt: nextVersion(current.updatedAt) }).where(eq(files.id, fileId));
      await audit(tx, c.get('userId'), vaultId, 'files', fileId, 'file.trash');
    });
    return c.body(null, 204);
  });
  app.route('/', createMemberRoutes(db));
  app.route('/', createShareRoutes(db, webOrigin));
  if (storage) app.route('/', createUploadRoutes(db, storage));
  return app;
}
