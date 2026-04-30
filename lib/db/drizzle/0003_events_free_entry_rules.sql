-- Incremental migration: add free_entry_rules column to events table
-- Safe to run on existing databases (uses IF NOT EXISTS semantics via ALTER TABLE ... ADD COLUMN IF NOT EXISTS).

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "free_entry_rules" jsonb;
