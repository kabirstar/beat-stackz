CREATE TABLE "blobs" (
	"sha256" text PRIMARY KEY NOT NULL,
	"s3_key" text NOT NULL,
	"size" bigint NOT NULL,
	"mime" text,
	"duration_ms" integer,
	"waveform" jsonb,
	"ref_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"folder_id" text,
	"name" text NOT NULL,
	"blob_sha256" text NOT NULL,
	"created_by" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"vault_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"created_by" text,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_blob_sha256_blobs_sha256_fk" FOREIGN KEY ("blob_sha256") REFERENCES "public"."blobs"("sha256") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_id_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "files_active_name_idx" ON "files" USING btree ("vault_id",coalesce("folder_id", ''),"name") WHERE "files"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "files_folder_idx" ON "files" USING btree ("vault_id","folder_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "folders_active_name_idx" ON "folders" USING btree ("vault_id",coalesce("parent_id", ''),"name") WHERE "folders"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "folders_parent_idx" ON "folders" USING btree ("vault_id","parent_id");