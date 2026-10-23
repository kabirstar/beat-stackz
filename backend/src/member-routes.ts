import { Hono } from 'hono';
import { vaultRoutes } from '@bpackz/shared';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from './db/index.ts';
import { users, vaultMembers } from './db/schema.ts';
import { audit, body, fail, lockVaults, member, parse, type VaultEnv } from './vault-data.ts';

export function createMemberRoutes(db: Database) {
  const app = new Hono<VaultEnv>();
  app.get('/:vaultId/members', async (c) => {
    const { vaultId } = parse(vaultRoutes.members.params, c.req.param());
    const result = await db.transaction(async (tx) => {
      await member(tx, vaultId, c.get('userId'));
      const items = await tx.select({ userId: users.id, email: users.email, name: users.name, role: vaultMembers.role })
        .from(vaultMembers).innerJoin(users, and(eq(users.id, vaultMembers.userId), isNull(users.deletedAt)))
        .where(eq(vaultMembers.vaultId, vaultId)).orderBy(asc(users.id));
      return vaultRoutes.members.response.parse({ items });
    });
    return c.json(result);
  });
  app.post('/:vaultId/members', async (c) => {
    const { vaultId } = parse(vaultRoutes.invite.params, c.req.param());
    const input = await body(c, vaultRoutes.invite.body);
    const result = await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      const access = await member(tx, vaultId, c.get('userId'));
      if (access.role !== 'owner' || access.vault.kind !== 'shared') fail(403, 'Shared vault owner required');
      const [user] = await tx.select().from(users).where(and(sql`lower(${users.email}) = ${input.email.toLowerCase()}`, isNull(users.deletedAt)));
      if (!user) fail(404, 'User not found');
      const [existing] = await tx.select().from(vaultMembers).where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, user.id)));
      if (existing) fail(409, 'Already a member');
      await tx.insert(vaultMembers).values({ vaultId, userId: user.id, role: input.role });
      await audit(tx, c.get('userId'), vaultId, 'vault_members', user.id, 'member.add');
      return vaultRoutes.invite.response.parse({ userId: user.id, email: user.email, name: user.name, role: input.role });
    });
    return c.json(result, 201);
  });
  app.delete('/:vaultId/members/:userId', async (c) => {
    const { vaultId, userId } = parse(vaultRoutes.removeMember.params, c.req.param());
    await db.transaction(async (tx) => {
      await lockVaults(tx, [vaultId]);
      const access = await member(tx, vaultId, c.get('userId'));
      if (access.role !== 'owner' && c.get('userId') !== userId) fail(403, 'Owner access required');
      const [target] = await tx.select().from(vaultMembers).where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)));
      if (!target) fail(404, 'Member not found');
      if (target.role === 'owner') {
        const owners = await tx.select({ id: users.id }).from(vaultMembers)
          .innerJoin(users, and(eq(users.id, vaultMembers.userId), isNull(users.deletedAt)))
          .where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.role, 'owner')));
        if (owners.some((owner) => owner.id === userId) && owners.length <= 1) fail(409, 'Cannot remove the last owner');
      }
      await tx.delete(vaultMembers).where(and(eq(vaultMembers.vaultId, vaultId), eq(vaultMembers.userId, userId)));
      await audit(tx, c.get('userId'), vaultId, 'vault_members', userId, 'member.remove');
    });
    return c.body(null, 204);
  });
  return app;
}
