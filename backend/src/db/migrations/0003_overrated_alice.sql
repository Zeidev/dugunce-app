CREATE TABLE IF NOT EXISTS "guest_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"allowed_party_size" integer DEFAULT 1 NOT NULL,
	"confirmed_party_size" integer,
	"rsvp_source" text,
	"rsvp_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"side" text DEFAULT 'BRIDE' NOT NULL,
	"invite_status" text DEFAULT 'NOT_SENT' NOT NULL,
	"rsvp" text DEFAULT 'PENDING' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "guests_id_wedding_unique" UNIQUE("id","wedding_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guest_invitations" ADD CONSTRAINT "guest_invitations_guest_fk" FOREIGN KEY ("guest_id","wedding_id") REFERENCES "public"."guests"("id","wedding_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "guests" ADD CONSTRAINT "guests_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_invitations_guest_idx" ON "guest_invitations" USING btree ("guest_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guest_invitations_wedding_idx" ON "guest_invitations" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guests_wedding_idx" ON "guests" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guests_deleted_idx" ON "guests" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "guests_side_idx" ON "guests" USING btree ("wedding_id","side");