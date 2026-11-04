CREATE TABLE IF NOT EXISTS "admin_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "role" text NOT NULL DEFAULT 'SUPER_ADMIN',
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "failed_attempts" integer NOT NULL DEFAULT 0,
  "locked_until" timestamptz,
  "last_login_at" timestamptz,
  "totp_secret" text,
  "totp_enabled_at" timestamptz,
  "recovery_codes" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_accounts_status_idx" ON "admin_accounts" ("status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "admin_id" uuid NOT NULL,
  "session_hash" text NOT NULL UNIQUE,
  "csrf_hash" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL,
  CONSTRAINT "admin_sessions_admin_fk" FOREIGN KEY ("admin_id")
    REFERENCES "admin_accounts"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_expires_idx" ON "admin_sessions" ("expires_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_type" text NOT NULL,
  "actor_id" uuid,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" uuid,
  "metadata" jsonb,
  "ip" text,
  "created_at" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
