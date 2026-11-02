CREATE TABLE IF NOT EXISTS "helpers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"access_token_hash" text NOT NULL,
	"token_revoked_at" timestamp with time zone,
	"created_by" uuid,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "helpers_access_token_hash_unique" UNIQUE("access_token_hash"),
	CONSTRAINT "helpers_id_wedding_unique" UNIQUE("id","wedding_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"sender_kind" text NOT NULL,
	"sender_user_id" uuid,
	"sender_helper_id" uuid,
	"body" text NOT NULL,
	"idempotency_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_task_idem_unique" UNIQUE("task_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wedding_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_helper_id" uuid,
	"status" text DEFAULT 'TODO' NOT NULL,
	"due_date" timestamp with time zone,
	"priority" text DEFAULT 'NORMAL' NOT NULL,
	"assigned_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "tasks_id_wedding_unique" UNIQUE("id","wedding_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "helpers" ADD CONSTRAINT "helpers_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "helpers" ADD CONSTRAINT "helpers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_helper_id_helpers_id_fk" FOREIGN KEY ("sender_helper_id") REFERENCES "public"."helpers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_task_fk" FOREIGN KEY ("task_id","wedding_id") REFERENCES "public"."tasks"("id","wedding_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_wedding_id_weddings_id_fk" FOREIGN KEY ("wedding_id") REFERENCES "public"."weddings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- NOT: ON DELETE SET NULL burada KULLANILAMAZ — PostgreSQL composite FK'da
-- tum FK kolonlarini null'lar, wedding_id NOT NULL oldugu icin patlar.
-- Yardimci silme servis katmaninda transaction ile yapilir.
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_fk" FOREIGN KEY ("assignee_helper_id","wedding_id") REFERENCES "public"."helpers"("id","wedding_id") ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "helpers_wedding_idx" ON "helpers" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_task_idx" ON "messages" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_wedding_idx" ON "tasks" USING btree ("wedding_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assignee_idx" ON "tasks" USING btree ("assignee_helper_id");--> statement-breakpoint
-- Mesaj uzunluğu DB seviyesinde de sınırlı (SECURITY §10.3 #6).
-- Uygulama katmanı atlanırsa (ör. doğrudan SQL, gelecekteki bir job)
-- DB yine reddeder. 4000 karakter sınırı ürün kararı.
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_body_length_check"
    CHECK (char_length("body") <= 4000);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Boş mesaj da geçersiz
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_body_not_empty_check"
    CHECK (char_length(btrim("body")) > 0);
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- sender_kind yalnızca COUPLE veya HELPER olabilir.
--
-- DİKKAT: "HELPER ise sender_helper_id dolu olmalı" kuralı BURADA
-- KULLANILAMAZ. `sender_helper_id` FK'si ON DELETE SET NULL; yardımcı
-- silinince kolon null olur ve böyle bir CHECK bunu reddeder — yani
-- mesajı olan hiçbir yardımcı silinemez. Aynı çelişki sender_user_id
-- için de geçerli.
--
-- "Tam olarak bir gönderen" değişmezi SERVİS katmanında korunur
-- (sendMessage her zaman birini yazar). Geçmişin yardımcı silindikten
-- sonra da yaşaması bilinçli tercih: yazar "silinmiş yardımcı" görünür.
DO $$ BEGIN
  ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_kind_check"
    CHECK ("sender_kind" IN ('COUPLE', 'HELPER'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
