-- Follower-based coupon targeting: "all" (legacy default) | "followers" | "non_followers".
ALTER TABLE "vendor_coupons" ADD COLUMN IF NOT EXISTS "audience" varchar(20) NOT NULL DEFAULT 'all';
CREATE INDEX IF NOT EXISTS "vendor_coupons_audience_idx" ON "vendor_coupons" ("audience");
