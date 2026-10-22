import { randomUUID } from 'node:crypto';
import type { Transaction } from './db/index.ts';
import { auditLog, vaultMembers, vaults } from './db/schema.ts';

export async function createPersonalVault(transaction: Transaction, userId: string) {
  const vaultId = randomUUID();
  await transaction.insert(vaults).values({ id: vaultId, kind: 'personal', name: 'My vault', createdBy: userId });
  await transaction.insert(vaultMembers).values({ vaultId, userId, role: 'owner' });
  await transaction.insert(auditLog).values([
    { actorId: userId, vaultId, targetType: 'vaults', targetId: vaultId, action: 'vault.create' },
    { actorId: userId, vaultId, targetType: 'vault_members', targetId: userId, action: 'member.add' },
  ]);
}
