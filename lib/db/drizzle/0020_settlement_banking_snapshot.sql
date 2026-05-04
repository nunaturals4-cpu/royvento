ALTER TABLE "settlement_requests"
  ADD COLUMN IF NOT EXISTS "banking_details_snapshot" jsonb;
