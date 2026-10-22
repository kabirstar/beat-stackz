CREATE TABLE "jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"file_id" text NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"payload" jsonb NOT NULL,
	CONSTRAINT "jobs_state_check" CHECK ("jobs"."state" in ('queued', 'running', 'done', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"vault_id" text NOT NULL,
	"folder_id" text,
	"name" text NOT NULL,
	"size" bigint NOT NULL,
	"mime" text,
	"claimed_sha256" text NOT NULL,
	"key" text NOT NULL,
	"multipart_id" text NOT NULL,
	"parts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" DROP CONSTRAINT "files_blob_sha256_blobs_sha256_fk";
--> statement-breakpoint
-- Preserve existing pre-upload fixtures and their object keys (ADR 0001 migration).
ALTER TABLE "blobs" DROP CONSTRAINT "blobs_pkey";
--> statement-breakpoint
ALTER TABLE "blobs" ALTER COLUMN "sha256" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "blobs" ADD COLUMN "id" text;
--> statement-breakpoint
ALTER TABLE "blobs" ADD COLUMN "verified_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "blobs" SET "id" = gen_random_uuid()::text, "verified_at" = now();
--> statement-breakpoint
ALTER TABLE "blobs" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "blob_id" text;
--> statement-breakpoint
UPDATE "files" SET "blob_id" = b.id FROM "blobs" b WHERE files.blob_sha256 = b.sha256;
--> statement-breakpoint
ALTER TABLE "files" ALTER COLUMN "blob_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "status" text DEFAULT 'processing' NOT NULL;
--> statement-breakpoint
UPDATE "files" SET "status" = 'ready';
--> statement-breakpoint
INSERT INTO audit_log (actor_id, vault_id, target_type, target_id, action)
SELECT created_by, vault_id, 'files', id, 'file.integrity_migrated' FROM files;
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_file_kind_idx" ON "jobs" USING btree ("file_id","kind");--> statement-breakpoint
CREATE INDEX "jobs_pending_idx" ON "jobs" USING btree ("state","run_after");--> statement-breakpoint
CREATE INDEX "uploads_expiry_idx" ON "uploads" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_blob_id_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."blobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" DROP COLUMN "blob_sha256";--> statement-breakpoint
ALTER TABLE "blobs" ADD CONSTRAINT "blobs_sha256_unique" UNIQUE("sha256");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_status_check" CHECK ("files"."status" in ('processing', 'ready', 'failed'));