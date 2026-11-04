ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "party_size_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "default_party_size" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "max_party_size" integer DEFAULT 10 NOT NULL;
