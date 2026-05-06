ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "image_urls" text[] NOT NULL DEFAULT ARRAY[]::text[];
