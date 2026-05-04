CREATE TABLE IF NOT EXISTS "vendor_commissions" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL UNIQUE REFERENCES "vendors"("id") ON DELETE CASCADE,
  "free_entry_rate" numeric(5,2) NOT NULL DEFAULT '0',
  "ticket_rate" numeric(5,2) NOT NULL DEFAULT '0',
  "table_booking_rate" numeric(5,2) NOT NULL DEFAULT '0',
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vendor_commissions_vendor_idx" ON "vendor_commissions" ("vendor_id");
