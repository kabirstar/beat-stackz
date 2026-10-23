import { createHash } from 'node:crypto';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { Transaction } from './db/index.ts';
import { shares, vaultMembers, vaults } from './db/schema.ts';
import { fail, file } from './vault-data.ts';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const activeShare = () => and(isNull(shares.revokedAt), or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())));
export const shareOut = (row: typeof shares.$inferSelect) => ({
  id: row.id, fileId: row.fileId, granteeUserId: row.granteeUserId, role: row.role,
  expiresAt: row.expiresAt?.toISOString() ?? null, createdBy: row.createdBy, createdAt: row.createdAt.toISOString(),
});

export async function fileAccess(tx: Transaction, vaultId: string, fileId: string, userId: string, write = false, token?: string) {
  const [membership] = await tx.select({ role: vaultMembers.role }).from(vaults)
    .leftJoin(vaultMembers, and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, userId)))
    .where(and(eq(vaults.id, vaultId), isNull(vaults.deletedAt)));
  if (membership?.role && (!write || membership.role !== 'viewer')) {
    return { current: await file(tx, vaultId, fileId), expiresAt: null };
  }
  const [grant] = membership ? await tx.select().from(shares).where(and(
    eq(shares.fileId, fileId), activeShare(),
    write ? and(eq(shares.granteeUserId, userId), eq(shares.role, 'edit')) : or(
      userId ? eq(shares.granteeUserId, userId) : undefined,
      token !== undefined ? eq(shares.tokenHash, hashToken(token)) : undefined,
    ),
  )).limit(1) : [];
  if (!grant || (!userId && token === undefined)) fail(token !== undefined ? 404 : 403, 'File access denied');
  return { current: await file(tx, vaultId, fileId), expiresAt: grant.expiresAt };
}
