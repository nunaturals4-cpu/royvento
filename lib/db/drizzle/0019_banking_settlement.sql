CREATE TABLE IF NOT EXISTS "vendor_banking_details" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "account_holder_name" varchar(255) NOT NULL DEFAULT '',
  "bank_name" varchar(255) NOT NULL DEFAULT '',
  "account_number" varchar(50) NOT NULL DEFAULT '',
  "ifsc_code" varchar(20) NOT NULL DEFAULT '',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vbd_vendor_idx" ON "vendor_banking_details" ("vendor_id");

CREATE TABLE IF NOT EXISTS "settlement_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "amount" numeric(12,2) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "admin_note" text NOT NULL DEFAULT '',
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "sr_vendor_idx" ON "settlement_requests" ("vendor_id");
CREATE INDEX IF NOT EXISTS "sr_status_idx" ON "settlement_requests" ("status");
