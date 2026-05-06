UPDATE "users"
SET "expo_push_token" = "push_token"
WHERE "push_token" != ''
  AND "expo_push_token" IS NULL;
