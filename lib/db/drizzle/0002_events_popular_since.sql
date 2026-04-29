-- Incremental migration: add popular_since column to events table
-- Safe to run on existing databases (uses IF NOT EXISTS semantics via ALTER TABLE ... ADD COLUMN IF NOT EXISTS).

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "popular_since" timestamp with time zone;
