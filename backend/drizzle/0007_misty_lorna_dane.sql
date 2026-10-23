CREATE INDEX "blobs_orphan_idx" ON "blobs" USING btree ("id") WHERE "blobs"."ref_count" = 0;--> statement-breakpoint
CREATE INDEX "files_deleted_idx" ON "files" USING btree ("deleted_at") WHERE "files"."deleted_at" is not null;--> statement-breakpoint
CREATE INDEX "folders_deleted_idx" ON "folders" USING btree ("deleted_at") WHERE "folders"."deleted_at" is not null;