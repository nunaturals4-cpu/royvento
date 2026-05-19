-- Add freeEntryForTable flag to events table.
-- When true, table bookings for this pub have free admission but commissions
-- still use tableBookingRate (not freeEntryRate).
ALTER TABLE events ADD COLUMN IF NOT EXISTS free_entry_for_table boolean NOT NULL DEFAULT false;
