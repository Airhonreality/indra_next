CREATE TABLE "local_sync_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"provider" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "local_sync_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"local_path" text NOT NULL,
	"blake3_hash" text NOT NULL,
	"remote_object_id" text,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "local_sync_state_user_path_unique" UNIQUE("user_id","local_path")
);
--> statement-breakpoint
ALTER TABLE "local_sync_settings" ADD CONSTRAINT "local_sync_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_sync_state" ADD CONSTRAINT "local_sync_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;