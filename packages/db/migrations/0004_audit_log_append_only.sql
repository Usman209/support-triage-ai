-- Custom migration: make audit_log append-only at the DATABASE level.
-- Even if the application (or someone with the app's credentials) tries UPDATE, DELETE or TRUNCATE,
-- Postgres refuses. An audit trail that can be edited is not evidence.
CREATE OR REPLACE FUNCTION audit_log_block_changes() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_no_update_delete ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_block_changes();
