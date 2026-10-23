import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ApiError } from '@bpackz/shared';
import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { Transaction } from './db/index.ts';
import { auditLog, blobs, files, folders, users, vaultMembers, vaults } from './db/schema.ts';

export type VaultEnv = { Variables: { userId: string } };

export type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } } };
const errors = { 400: 'invalid', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict' } as const;
export function fail(status: keyof typeof errors, message: string, issues?: ApiError['issues']): never {
  throw new HTTPException(status, { res: Response.json(ApiError.parse({ error: errors[status], message, issues }), { status }) });
}
export function parse<T>(schema: Schema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) fail(400, 'Invalid request', result.error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'), message: issue.message,
  })));
  return result.data;
}
export async function body<T>(context: Context, schema: Schema<T>): Promise<T> {
  let input: unknown;
  try { input = await context.req.json(); } catch { fail(400, 'Invalid JSON'); }
  return parse(schema, input);
}
export const atParent = (column: typeof folders.parentId | typeof files.folderId, id: string | null) => id === null ? isNull(column) : eq(column, id);
export const folderOut = (row: typeof folders.$inferSelect) => ({ ...row, updatedAt: row.updatedAt.toISOString() });
export const vaultOut = (row: typeof vaults.$inferSelect, role: string) => ({ ...row, myRole: role, createdAt: row.createdAt.toISOString() });
export const fileSelection = {
  id: files.id, vaultId: files.vaultId, folderId: files.folderId, name: files.name,
  status: files.status, size: blobs.size, mime: blobs.mime, sha256: blobs.sha256, durationMs: blobs.durationMs,
  hasWaveform: sql<boolean>`${blobs.waveform} is not null`, createdBy: files.createdBy,
  createdAt: files.createdAt, updatedAt: files.updatedAt,
};
export const fileOut = <T extends { createdAt: Date; updatedAt: Date }>(row: T) => ({
  ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
});
export const nextVersion = (previous: Date) => new Date(Math.max(Date.now(), previous.getTime() + 1));

// shortcut: serialize mutations per vault; use finer locks if measured contention warrants it.
// Sorted locks also protect cross-vault moves from deadlocks.
export async function lockVaults(tx: Transaction, ids: string[]) {
  await tx.select({ id: vaults.id }).from(vaults).where(inArray(vaults.id, [...new Set(ids)]))
    .orderBy(asc(vaults.id)).for('update');
}
export async function member(tx: Transaction, vaultId: string, userId: string, write = false) {
  const [row] = await tx.select({ vault: vaults, role: vaultMembers.role }).from(vaults)
    .innerJoin(vaultMembers, and(eq(vaultMembers.vaultId, vaults.id), eq(vaultMembers.userId, userId)))
    .innerJoin(users, and(eq(users.id, userId), isNull(users.deletedAt)))
    .where(and(eq(vaults.id, vaultId), isNull(vaults.deletedAt)));
  if (!row) fail(403, 'Vault access denied');
  if (write && row.role === 'viewer') fail(403, 'Editor access required');
  return row;
}
export async function folder(tx: Transaction, vaultId: string, id: string) {
  const [row] = await tx.select().from(folders).where(and(eq(folders.id, id), eq(folders.vaultId, vaultId), isNull(folders.deletedAt)));
  if (!row) fail(404, 'Folder not found');
  return row;
}
export async function file(tx: Transaction, vaultId: string, id: string) {
  const [row] = await tx.select(fileSelection).from(files).innerJoin(blobs, eq(blobs.id, files.blobId))
    .where(and(eq(files.id, id), eq(files.vaultId, vaultId), isNull(files.deletedAt)));
  if (!row) fail(404, 'File not found');
  return row;
}
export async function availableName(tx: Transaction, vaultId: string, parentId: string | null, name: string, exceptId = '') {
  const [existingFolder] = await tx.select({ id: folders.id }).from(folders).where(and(
    eq(folders.vaultId, vaultId), atParent(folders.parentId, parentId), eq(folders.name, name),
    ne(folders.id, exceptId), isNull(folders.deletedAt))).limit(1);
  const [existingFile] = await tx.select({ id: files.id }).from(files).where(and(
    eq(files.vaultId, vaultId), atParent(files.folderId, parentId), eq(files.name, name),
    ne(files.id, exceptId), isNull(files.deletedAt))).limit(1);
  if (existingFolder || existingFile) fail(409, 'Name already exists in this folder');
}
export async function audit(tx: Transaction, actorId: string | null, vaultId: string, targetType: string, targetId: string, action: string) {
  await tx.insert(auditLog).values({ actorId, vaultId, targetType, targetId, action });
}
export const subtree = (vaultId: string, folderId: string) => sql`
  WITH RECURSIVE tree AS (
    SELECT id FROM folders WHERE id = ${folderId} AND vault_id = ${vaultId} AND deleted_at IS NULL
    UNION
    SELECT f.id FROM folders f JOIN tree t ON f.parent_id = t.id
    WHERE f.vault_id = ${vaultId} AND f.deleted_at IS NULL
  )`;

