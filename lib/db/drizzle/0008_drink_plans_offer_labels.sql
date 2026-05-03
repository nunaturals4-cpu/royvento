ALTER TABLE "drink_plans" ADD COLUMN IF NOT EXISTS "drinks_offer_label" varchar(255) NOT NULL DEFAULT '';
ALTER TABLE "drink_plans" ADD COLUMN IF NOT EXISTS "food_discount_label" varchar(255) NOT NULL DEFAULT '';
