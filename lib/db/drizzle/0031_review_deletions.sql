CREATE TABLE IF NOT EXISTS "review_deletions" (
  "id" serial PRIMARY KEY NOT NULL,
  "review_id" integer NOT NULL,
  "vendor_id" integer NOT NULL,
  "deleted_by_user_id" integer NOT NULL,
  "deleted_by_role" varchar(20) NOT NULL,
  "original_user_id" integer NOT NULL,
  "original_rating" integer NOT NULL,
  "original_comment" text DEFAULT '' NOT NULL,
  "deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_deletions_vendor_idx" ON "review_deletions" ("vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_deletions_review_idx" ON "review_deletions" ("review_id");
