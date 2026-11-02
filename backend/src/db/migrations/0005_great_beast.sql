CREATE TABLE IF NOT EXISTS "helper_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"helper_id" uuid NOT NULL,
	"wedding_id" uuid NOT NULL,
	"session_hash" text NOT NULL,
	"csrf_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "helper_sessions_session_hash_unique" UNIQUE("session_hash")
);
--> statement-breakpoint
ALTER TABLE "helpers" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
-- Mevcut yardımcılara geriye dönük 90 gün (SECURITY §1.2 #3).
UPDATE "helpers" SET "expires_at" = now() + interval '90 days' WHERE "expires_at" IS NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "helper_sessions" ADD CONSTRAINT "helper_sessions_helper_fk" FOREIGN KEY ("helper_id","wedding_id") REFERENCES "public"."helpers"("id","wedding_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helper_sessions_expires_idx" ON "helper_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helper_sessions_helper_idx" ON "helper_sessions" USING btree ("helper_id");--> statement-breakpoint
