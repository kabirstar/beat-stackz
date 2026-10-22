import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('name').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('sessions_user_id_idx').on(table.userId)]);

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('accounts_user_id_idx').on(table.userId),
  uniqueIndex('accounts_provider_account_idx').on(table.providerId, table.accountId),
]);

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('verifications_identifier_idx').on(table.identifier)]);

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  actorId: text('actor_id'),
  vaultId: text('vault_id'),
  targetType: text('target_type'),
  targetId: text('target_id'),
  action: text('action').notNull(),
  meta: jsonb('meta'),
}, (table) => [
  index('audit_log_actor_at_idx').on(table.actorId, table.at),
  index('audit_log_vault_at_idx').on(table.vaultId, table.at),
]);

export const vaults = pgTable('vaults', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  createdBy: text('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  check('vaults_kind_check', sql`${table.kind} in ('personal', 'shared')`),
  uniqueIndex('vaults_personal_owner_idx').on(table.createdBy).where(sql`${table.kind} = 'personal'`),
]);

export const vaultMembers = pgTable('vault_members', {
  vaultId: text('vault_id').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
}, (table) => [
  primaryKey({ columns: [table.vaultId, table.userId] }),
  index('vault_members_user_idx').on(table.userId),
  check('vault_members_role_check', sql`${table.role} in ('owner', 'editor', 'viewer')`),
]);

export const folders = pgTable('folders', {
  id: text('id').primaryKey(),
  vaultId: text('vault_id').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  parentId: text('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('folders_active_name_idx').on(table.vaultId, sql`coalesce(${table.parentId}, '')`, table.name).where(sql`${table.deletedAt} is null`),
  index('folders_parent_idx').on(table.vaultId, table.parentId),
]);

export const blobs = pgTable('blobs', {
  sha256: text('sha256').primaryKey(),
  s3Key: text('s3_key').notNull(),
  size: bigint('size', { mode: 'number' }).notNull(),
  mime: text('mime'),
  durationMs: integer('duration_ms'),
  waveform: jsonb('waveform'),
  refCount: integer('ref_count').notNull().default(0),
});

export const files = pgTable('files', {
  id: text('id').primaryKey(),
  vaultId: text('vault_id').notNull().references(() => vaults.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  blobSha256: text('blob_sha256').notNull().references(() => blobs.sha256),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('files_active_name_idx').on(table.vaultId, sql`coalesce(${table.folderId}, '')`, table.name).where(sql`${table.deletedAt} is null`),
  index('files_folder_idx').on(table.vaultId, table.folderId, table.id),
]);
