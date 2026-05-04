CREATE UNIQUE INDEX IF NOT EXISTS "reviews_user_vendor_uniq" ON "reviews" ("user_id","vendor_id");
