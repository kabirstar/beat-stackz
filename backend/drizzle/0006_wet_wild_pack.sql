CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text NOT NULL,
	"grantee_user_id" text,
	"token_hash" text,
	"role" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "shares_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "shares_role_check" CHECK ("shares"."role" in ('view', 'edit')),
	CONSTRAINT "shares_grant_check" CHECK (("shares"."grantee_user_id" is null) <> ("shares"."token_hash" is null)),
	CONSTRAINT "shares_link_role_check" CHECK ("shares"."token_hash" is null or "shares"."role" = 'view')
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_grantee_user_id_users_id_fk" FOREIGN KEY ("grantee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shares_file_idx" ON "shares" USING btree ("file_id");