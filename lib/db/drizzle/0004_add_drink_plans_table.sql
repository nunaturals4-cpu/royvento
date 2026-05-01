-- Migration: create drink_plans table for partner drink packages and welcome offers
-- Safe to run on existing databases (uses CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "drink_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL DEFAULT 'welcome',
  "product_name" varchar(255) NOT NULL DEFAULT '',
  "gender" varchar(10) NOT NULL DEFAULT 'all',
  "price" integer NOT NULL DEFAULT 0,
  "days" text[] NOT NULL DEFAULT '{}',
  "time_from" varchar(8) NOT NULL DEFAULT '',
  "time_to" varchar(8) NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "drink_plans_vendor_idx" ON "drink_plans" ("vendor_id");
