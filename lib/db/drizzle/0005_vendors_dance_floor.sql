-- Migration: add dance_floor column to vendors table
-- Nullable; values: 'dedicated' | 'general' | 'none'. NULL means not yet set.

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "dance_floor" varchar(20);
