import { randomUUID } from 'node:crypto';
import { DEFAULT_FOLDERS } from '@bpackz/shared';
import type { Transaction } from './db/index.ts';
import { folders } from './db/schema.ts';
import { audit } from './vault-data.ts';

export async function seedDefaultFolders(tx: Transaction, vaultId: string, userId: string) {
  const rows = DEFAULT_FOLDERS.flatMap(({ kind, name, children }) => {
    const id = randomUUID();
    return [
      { id, vaultId, parentId: null, name, kind, createdBy: userId },
      ...children.map((child) => ({ id: randomUUID(), vaultId, parentId: id,
        name: child.name, kind: child.kind, createdBy: userId })),
    ];
  });
  await tx.insert(folders).values(rows);
  await audit(tx, userId, vaultId, 'vaults', vaultId, 'vault.seed_folders');
}
