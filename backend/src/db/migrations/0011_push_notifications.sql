CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token" text NOT NULL,
  "platform" text NOT NULL DEFAULT 'ANDROID',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "device_tokens_token_unique" UNIQUE("token"),
  CONSTRAINT "device_tokens_user_fk" FOREIGN KEY ("user_id")
    REFERENCES "users"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "device_tokens_user_idx" ON "device_tokens" ("user_id");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notifications_enabled" boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "quiet_hours_override" boolean NOT NULL DEFAULT false;
