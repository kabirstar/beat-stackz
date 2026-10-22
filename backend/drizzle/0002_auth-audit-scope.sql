CREATE INDEX "audit_log_actor_at_idx" ON "audit_log" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_vault_at_idx" ON "audit_log" USING btree ("vault_id","at");
--> statement-breakpoint
DROP TRIGGER sessions_audit ON sessions;
--> statement-breakpoint
CREATE TRIGGER sessions_audit AFTER INSERT OR DELETE ON sessions
FOR EACH ROW EXECUTE FUNCTION audit_auth_change();
--> statement-breakpoint
DROP TRIGGER verifications_audit ON verifications;
