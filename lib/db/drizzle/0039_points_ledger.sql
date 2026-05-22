CREATE TABLE IF NOT EXISTS "points_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "points" integer NOT NULL,
  "source" varchar(30) NOT NULL,
  "booking_id" integer,
  "expires_at" timestamp with time zone,
  "notified_day_20" boolean NOT NULL DEFAULT false,
  "notified_day_23" boolean NOT NULL DEFAULT false,
  "notified_day_26" boolean NOT NULL DEFAULT false,
  "notified_day_29" boolean NOT NULL DEFAULT false,
  "expired" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "points_ledger_user_idx" ON "points_ledger" ("user_id");
CREATE INDEX IF NOT EXISTS "points_ledger_expires_idx" ON "points_ledger" ("expires_at");
CREATE INDEX IF NOT EXISTS "points_ledger_expired_idx" ON "points_ledger" ("expired");
