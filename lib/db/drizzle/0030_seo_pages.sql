-- Admin-editable editorial copy for programmatic SEO landing pages.
-- Natural key (template, city_slug, second_slug). second_slug is NULL for
-- /:city pages, set to the locality or category slug for /:city/:second.
CREATE TABLE IF NOT EXISTS "seo_pages" (
  "id" serial PRIMARY KEY NOT NULL,
  "template" varchar(32) NOT NULL,
  "city_slug" varchar(64) NOT NULL,
  "second_slug" varchar(64),
  "title" text,
  "meta_description" text,
  "intro_md" text NOT NULL DEFAULT '',
  "faqs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- second_slug may be NULL; Postgres treats NULLs as distinct in unique
-- indexes by default, but Drizzle pre v17 emits a plain unique. We rely on
-- "NULLS NOT DISTINCT" so the (city) row is also constrained.
CREATE UNIQUE INDEX IF NOT EXISTS "seo_pages_key_uniq"
  ON "seo_pages" ("template", "city_slug", "second_slug")
  NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS "seo_pages_city_idx" ON "seo_pages" ("city_slug");
