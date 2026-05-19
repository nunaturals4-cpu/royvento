ALTER TABLE events ADD COLUMN IF NOT EXISTS free_entry_for_table_days jsonb;
ALTER TABLE events ADD COLUMN IF NOT EXISTS free_entry_for_table_before_time text;
