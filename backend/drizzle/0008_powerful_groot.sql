ALTER TABLE "folders" ADD COLUMN "kind" text;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_kind_check" CHECK ("folders"."kind" in (
    'beats', 'presets', 'presets/plugin', 'presets/vocals',
    'vocals', 'vocals/main', 'vocals/adlib', 'vocals/bg',
    'songs', 'songs/demo', 'songs/mix', 'songs/drop',
    'media', 'media/photos', 'media/videos', 'media/mv', 'media/bts', 'media/covers'
  ));
--> statement-breakpoint
-- Freeze ADR 0002's tree in this migration; future taxonomy changes get a new migration.
-- Block writes while checking cross-table names. Never rename, retag or revive existing content.
LOCK TABLE folders, files IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE
  v record;
  d record;
  parent_folder text;
  existing_id text;
  existing_deleted timestamptz;
  new_id text;
  parents jsonb;
  inserted integer;
BEGIN
  FOR v IN SELECT id, created_by FROM vaults WHERE deleted_at IS NULL ORDER BY id LOOP
    parents := '{}'::jsonb;
    inserted := 0;
    FOR d IN SELECT * FROM (VALUES
      ('beats', 'beats', NULL::text, 0),
      ('presets', 'presets', NULL::text, 1),
      ('presets/plugin', 'plugin', 'presets', 2),
      ('presets/vocals', 'vocals', 'presets', 3),
      ('vocals', 'vocals', NULL::text, 4),
      ('vocals/main', 'main', 'vocals', 5),
      ('vocals/adlib', 'adlib', 'vocals', 6),
      ('vocals/bg', 'bg', 'vocals', 7),
      ('songs', 'songs', NULL::text, 8),
      ('songs/demo', 'demo', 'songs', 9),
      ('songs/mix', 'mix', 'songs', 10),
      ('songs/drop', 'drop', 'songs', 11),
      ('media', 'media', NULL::text, 12),
      ('media/photos', 'photos', 'media', 13),
      ('media/videos', 'videos', 'media', 14),
      ('media/mv', 'music video', 'media', 15),
      ('media/bts', 'bts', 'media', 16),
      ('media/covers', 'album covers', 'media', 17)
    ) AS defaults(kind, name, parent_kind, position) ORDER BY position LOOP
      parent_folder := NULL;
      IF d.parent_kind IS NOT NULL THEN
        parent_folder := parents ->> d.parent_kind;
        IF parent_folder IS NULL THEN CONTINUE; END IF;
      END IF;
      SELECT id, deleted_at INTO existing_id, existing_deleted FROM folders
      WHERE vault_id = v.id AND (kind = d.kind OR (name = d.name AND parent_id IS NOT DISTINCT FROM parent_folder))
      ORDER BY (kind = d.kind) DESC NULLS LAST, (deleted_at IS NULL) DESC, id LIMIT 1;
      IF FOUND THEN
        IF d.parent_kind IS NULL AND existing_deleted IS NULL THEN
          parents := parents || jsonb_build_object(d.kind, existing_id);
        END IF;
        CONTINUE;
      END IF;
      IF EXISTS (SELECT 1 FROM files WHERE vault_id = v.id AND folder_id IS NOT DISTINCT FROM parent_folder
                 AND name = d.name AND deleted_at IS NULL) THEN CONTINUE; END IF;
      INSERT INTO folders (id, vault_id, parent_id, name, kind, created_by)
      VALUES (gen_random_uuid()::text, v.id, parent_folder, d.name, d.kind, v.created_by)
      RETURNING id INTO new_id;
      IF d.parent_kind IS NULL THEN parents := parents || jsonb_build_object(d.kind, new_id); END IF;
      inserted := inserted + 1;
    END LOOP;
    IF inserted > 0 THEN
      INSERT INTO audit_log (vault_id, target_type, target_id, action, meta)
      VALUES (v.id, 'vaults', v.id, 'vault.seed_folders', jsonb_build_object('count', inserted, 'backfill', true));
    END IF;
  END LOOP;
END $$;
