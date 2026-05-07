-- Multi-device web push subscriptions: each row represents one
-- browser/device push endpoint registered for a user.
CREATE TABLE IF NOT EXISTS "web_push_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "endpoint" text NOT NULL,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "web_push_subscriptions_endpoint_uniq"
  ON "web_push_subscriptions" ("endpoint");
CREATE INDEX IF NOT EXISTS "web_push_subscriptions_user_idx"
  ON "web_push_subscriptions" ("user_id");
