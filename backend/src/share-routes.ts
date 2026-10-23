import { randomBytes, randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { shareRoutes } from '@bpackz/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { files, shares, users } from './db/schema.ts';
import { activeShare, fileAccess, hashToken, shareOut } from './share-data.ts';
import { audit, body, fail, file, fileOut, lockVaults, member, parse, type VaultEnv } from './vault-data.ts';

export function createShareRoutes(db: Database, webOrigin: string) {
  const app = new Hono<VaultEnv>();
  app.get('/:vaultId/files/:fileId/shares', async (c) => {
    const { vaultId, fileId } = parse(shareRoutes.list.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      await member(tx, vaultId, c.get('userId'));
      await file(tx, vaultId, fileId);
      const rows = await tx.select().from(shares).where(and(eq(shares.fileId, fileId), activeShare())).orderBy(asc(shares.id));
      return shareRoutes.list.response.parse({ items: rows.map(shareOut) });
    });
    return c.json(result);
  });
  app.post('/:vaultId/files/:fileId/shares', async (c) => {
    const { vaultId, fileId } = parse(shareRoutes.create.params, c.req.param());
    const input = await body(c, shareRoutes.create.body);
    if (!input.granteeEmail && input.role === 'edit') fail(400, 'Edit shares require a grantee');
    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      await file(tx, vaultId, fileId);
      let granteeUserId: string | null = null;
      if (input.granteeEmail) {
        const [user] = await tx.select({ id: users.id }).from(users)
          .where(and(sql`lower(${users.email}) = ${input.granteeEmail.toLowerCase()}`, isNull(users.deletedAt)));
        if (!user) fail(404, 'User not found');
        granteeUserId = user.id;
      }
      const token = granteeUserId ? null : randomBytes(32).toString('base64url');
      const [created] = await tx.insert(shares).values({ id: randomUUID(), fileId, granteeUserId,
        tokenHash: token ? hashToken(token) : null, role: input.role,
        expiresAt: new Date(Date.now() + input.expiresInHours * 3_600_000), createdBy: c.get('userId') }).returning();
      await audit(tx, c.get('userId'), vaultId, 'shares', created.id, 'share.create');
      return shareRoutes.create.response.parse({ ...shareOut(created), ...(token ? { url: `${webOrigin}/s/${token}` } : {}) });
    });
    return c.json(result, 201);
  });
  app.delete('/:vaultId/files/:fileId/shares/:shareId', async (c) => {
    const { vaultId, fileId, shareId } = parse(shareRoutes.revoke.params, c.req.param());
    await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      await member(tx, vaultId, c.get('userId'), true);
      await file(tx, vaultId, fileId);
      const [current] = await tx.select().from(shares).where(and(eq(shares.id, shareId), eq(shares.fileId, fileId)));
      if (!current) fail(404, 'Share not found');
      if (!current.revokedAt) {
        await tx.update(shares).set({ revokedAt: new Date() }).where(eq(shares.id, shareId));
        await audit(tx, c.get('userId'), vaultId, 'shares', shareId, 'share.revoke');
      }
    });
    return c.body(null, 204);
  });
  return app;
}

export function createShareLanding(db: Database) {
  const app = new Hono();
  app.get(shareRoutes.resolve.path, async (c) => {
    c.header('Cache-Control', 'no-store');
    const { token } = parse(shareRoutes.resolve.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      const [grant] = await tx.select().from(shares).where(and(eq(shares.tokenHash, hashToken(token)), activeShare()));
      if (!grant) fail(404, 'Share not found');
      // Locate the file without accepting any client-supplied vault identity.
      const [location] = await tx.select({ vaultId: files.vaultId }).from(files).where(eq(files.id, grant.fileId));
      if (!location) fail(404, 'Share not found');
      const access = await fileAccess(tx, location.vaultId, grant.fileId, '', false, token);
      return shareRoutes.resolve.response.parse({ file: fileOut(access.current), role: grant.role, expiresAt: grant.expiresAt?.toISOString() ?? null });
    });
    return c.json(result);
  });
  return app;
}
