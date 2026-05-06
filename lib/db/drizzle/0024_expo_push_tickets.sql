CREATE TABLE "expo_push_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" varchar(255) NOT NULL,
	"user_id" integer NOT NULL,
	"token" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expo_push_tickets_ticket_id_idx" UNIQUE("ticket_id")
);
--> statement-breakpoint
ALTER TABLE "expo_push_tickets" ADD CONSTRAINT "expo_push_tickets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "expo_push_tickets_user_idx" ON "expo_push_tickets" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "expo_push_tickets_expires_at_idx" ON "expo_push_tickets" USING btree ("expires_at");
