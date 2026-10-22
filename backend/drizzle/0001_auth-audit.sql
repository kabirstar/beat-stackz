-- Database triggers keep auth-library writes and their audit rows in one transaction.
CREATE FUNCTION audit_auth_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  changed_row jsonb;
  subject_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed_row := to_jsonb(OLD);
  ELSE
    changed_row := to_jsonb(NEW);
  END IF;
  IF TG_TABLE_NAME = 'users' THEN
    subject_id := changed_row->>'id';
  ELSE
    subject_id := changed_row->>'user_id';
  END IF;
  INSERT INTO audit_log (actor_id, target_type, target_id, action)
  VALUES (subject_id, TG_TABLE_NAME, changed_row->>'id', 'auth.' || TG_TABLE_NAME || '.' || lower(TG_OP));
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION audit_auth_change();
--> statement-breakpoint
CREATE TRIGGER sessions_audit AFTER INSERT OR UPDATE OR DELETE ON sessions
FOR EACH ROW EXECUTE FUNCTION audit_auth_change();
--> statement-breakpoint
CREATE TRIGGER accounts_audit AFTER INSERT OR UPDATE OR DELETE ON accounts
FOR EACH ROW EXECUTE FUNCTION audit_auth_change();
--> statement-breakpoint
CREATE TRIGGER verifications_audit AFTER INSERT OR UPDATE OR DELETE ON verifications
FOR EACH ROW EXECUTE FUNCTION audit_auth_change();
