ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;
--> statement-breakpoint
-- Backfill already-approved events so the 15-day "New" badge has a baseline.
-- Uses created_at as the approval proxy for historical rows; only those created
-- within the last 15 days will actually surface the badge.
UPDATE "events" SET "approved_at" = "created_at" WHERE "approval_status" = 'approved' AND "approved_at" IS NULL;
