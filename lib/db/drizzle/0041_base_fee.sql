ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "base_fee_percent" numeric(5,2) DEFAULT 3.50;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "base_fee_enabled" boolean DEFAULT true;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "base_fee" integer DEFAULT 0;
