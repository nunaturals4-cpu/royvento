-- Add commissionOwed column for tracking unpaid COD/free-entry commission
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "commission_owed" numeric(14, 2) NOT NULL DEFAULT '0';

-- Create commission_ledger table for immutable per-booking commission entries
CREATE TABLE IF NOT EXISTS "commission_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL,
  "booking_id" integer,
  "amount" numeric(12, 2) NOT NULL DEFAULT '0',
  "booking_type" varchar(30) NOT NULL,
  "trigger" varchar(30) NOT NULL,
  "payment_id" integer,
  "settlement_request_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_payment_id_payments_id_fk"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "commission_ledger" ADD CONSTRAINT "commission_ledger_settlement_request_id_settlement_requests_id_fk"
    FOREIGN KEY ("settlement_request_id") REFERENCES "settlement_requests"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "commission_ledger_vendor_idx" ON "commission_ledger" ("vendor_id");
CREATE INDEX IF NOT EXISTS "commission_ledger_booking_idx" ON "commission_ledger" ("booking_id");
CREATE INDEX IF NOT EXISTS "commission_ledger_trigger_idx" ON "commission_ledger" ("trigger");
CREATE UNIQUE INDEX IF NOT EXISTS "commission_ledger_booking_trigger_uniq" ON "commission_ledger" ("booking_id", "trigger");
