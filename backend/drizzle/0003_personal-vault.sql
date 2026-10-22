CREATE TABLE "vault_members" (
	"vault_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "vault_members_vault_id_user_id_pk" PRIMARY KEY("vault_id","user_id"),
	CONSTRAINT "vault_members_role_check" CHECK ("vault_members"."role" in ('owner', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "vaults_kind_check" CHECK ("vaults"."kind" in ('personal', 'shared'))
);
--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_members" ADD CONSTRAINT "vault_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_members_user_idx" ON "vault_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vaults_personal_owner_idx" ON "vaults" USING btree ("created_by") WHERE "vaults"."kind" = 'personal';
--> statement-breakpoint
-- Existing active users predate signup provisioning; rerunning this backfill is harmless.
WITH new_vaults AS (
  INSERT INTO vaults (id, kind, name, created_by)
  SELECT gen_random_uuid()::text, 'personal', 'My vault', users.id FROM users
  WHERE users.deleted_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM vaults WHERE vaults.created_by = users.id AND vaults.kind = 'personal'
  )
  ON CONFLICT DO NOTHING
  RETURNING id, created_by
), new_members AS (
  INSERT INTO vault_members (vault_id, user_id, role)
  SELECT id, created_by, 'owner' FROM new_vaults
  RETURNING vault_id, user_id
)
INSERT INTO audit_log (actor_id, vault_id, target_type, target_id, action)
SELECT created_by, id, 'vaults', id, 'vault.create' FROM new_vaults
UNION ALL
SELECT user_id, vault_id, 'vault_members', user_id, 'member.add' FROM new_members;
