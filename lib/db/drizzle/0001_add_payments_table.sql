-- Incremental migration: add payments table for PhonePe integration
-- Safe to run on existing databases (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "merchant_transaction_id" varchar(64) NOT NULL,
  "booking_id" integer,
  "subscription_id" integer,
  "amount" integer NOT NULL,
  "status" varchar(20) DEFAULT 'initiated' NOT NULL,
  "phonepe_transaction_id" varchar(128) DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "payments_merchant_tx_idx" ON "payments" USING btree ("merchant_transaction_id");
CREATE INDEX IF NOT EXISTS "payments_booking_idx" ON "payments" USING btree ("booking_id");
CREATE INDEX IF NOT EXISTS "payments_subscription_idx" ON "payments" USING btree ("subscription_id");
