ALTER TABLE "drink_plans" ADD COLUMN IF NOT EXISTS "global_priority" integer;
CREATE INDEX IF NOT EXISTS "drink_plans_global_priority_idx" ON "drink_plans" ("global_priority");
