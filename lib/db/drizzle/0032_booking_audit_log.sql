-- Append-only audit trail for booking finalization events.
-- Captures the "Save Actual Entry" transaction so admins can reconcile
-- original booked counts, edited counts at the door, the final saved
-- amount, the scanner identity, and the timestamp. Survives later edits.
CREATE TABLE IF NOT EXISTS "booking_audit_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL,
  "vendor_id" integer NOT NULL,
  "actor_user_id" integer,
  "action" varchar(40) NOT NULL,
  "before_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "after_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "booking_audit_log" ADD CONSTRAINT "booking_audit_log_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "booking_audit_log" ADD CONSTRAINT "booking_audit_log_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "booking_audit_log_booking_idx" ON "booking_audit_log" ("booking_id");
CREATE INDEX IF NOT EXISTS "booking_audit_log_vendor_idx" ON "booking_audit_log" ("vendor_id");
CREATE INDEX IF NOT EXISTS "booking_audit_log_action_idx" ON "booking_audit_log" ("action");
CREATE INDEX IF NOT EXISTS "booking_audit_log_created_idx" ON "booking_audit_log" ("created_at");
