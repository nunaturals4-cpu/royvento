ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "checked_out" boolean NOT NULL DEFAULT false;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "checked_out_at" timestamptz;
