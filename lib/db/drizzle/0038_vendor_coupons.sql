CREATE TABLE IF NOT EXISTS "vendor_coupons" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL REFERENCES "vendors"("id") ON DELETE CASCADE,
  "code" varchar(10) NOT NULL,
  "discount_type" varchar(10) NOT NULL DEFAULT 'percent',
  "discount_value" numeric(10,2) NOT NULL DEFAULT '10',
  "applicable_to" varchar(20) NOT NULL DEFAULT 'both',
  "active" boolean NOT NULL DEFAULT true,
  "max_uses" integer,
  "used_count" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendor_coupons_code_idx" ON "vendor_coupons" ("code");
CREATE INDEX IF NOT EXISTS "vendor_coupons_vendor_idx" ON "vendor_coupons" ("vendor_id");
CREATE INDEX IF NOT EXISTS "vendor_coupons_active_idx" ON "vendor_coupons" ("active");
