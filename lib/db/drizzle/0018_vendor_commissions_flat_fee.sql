-- Increase precision of commission rate columns to support flat INR fees
-- up to ₹99,999.99 (was 5,2 which only supported up to 999.99)
ALTER TABLE "vendor_commissions"
  ALTER COLUMN "free_entry_rate" TYPE numeric(8,2),
  ALTER COLUMN "ticket_rate" TYPE numeric(8,2),
  ALTER COLUMN "table_booking_rate" TYPE numeric(8,2);
