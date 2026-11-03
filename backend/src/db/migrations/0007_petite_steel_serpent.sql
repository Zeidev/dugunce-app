ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "template" text DEFAULT 'ZARIF' NOT NULL;--> statement-breakpoint
ALTER TABLE "weddings" ADD COLUMN IF NOT EXISTS "font_key" text DEFAULT '' NOT NULL;
