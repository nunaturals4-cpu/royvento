-- Email Management System: threads, messages, attachments.
-- Powers Admin Panel → "Send & Receive Email" (Resend send + inbound webhook).

CREATE TABLE IF NOT EXISTS "email_threads" (
  "id" serial PRIMARY KEY NOT NULL,
  "subject" text NOT NULL DEFAULT '',
  "normalized_subject" varchar(500) NOT NULL DEFAULT '',
  "counterparty_email" varchar(320) NOT NULL DEFAULT '',
  "counterparty_name" varchar(255) NOT NULL DEFAULT '',
  "last_message_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_message_preview" varchar(300) NOT NULL DEFAULT '',
  "last_direction" varchar(10) NOT NULL DEFAULT 'inbound',
  "message_count" integer NOT NULL DEFAULT 0,
  "has_unread" boolean NOT NULL DEFAULT false,
  "has_inbound" boolean NOT NULL DEFAULT false,
  "has_sent" boolean NOT NULL DEFAULT false,
  "has_draft" boolean NOT NULL DEFAULT false,
  "has_failed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "email_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "thread_id" integer,
  "direction" varchar(10) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'received',
  "from_email" varchar(320) NOT NULL DEFAULT '',
  "from_name" varchar(255) NOT NULL DEFAULT '',
  "to_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "cc_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "bcc_emails" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "subject" text NOT NULL DEFAULT '',
  "body_text" text NOT NULL DEFAULT '',
  "body_html" text NOT NULL DEFAULT '',
  "snippet" varchar(300) NOT NULL DEFAULT '',
  "resend_id" varchar(255) NOT NULL DEFAULT '',
  "message_id" varchar(998) NOT NULL DEFAULT '',
  "in_reply_to" varchar(998) NOT NULL DEFAULT '',
  "references_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_read" boolean NOT NULL DEFAULT false,
  "error_message" text NOT NULL DEFAULT '',
  "opened_at" timestamp with time zone,
  "clicked_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "sent_by_user_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "email_attachments" (
  "id" serial PRIMARY KEY NOT NULL,
  "message_id" integer,
  "filename" varchar(500) NOT NULL DEFAULT 'attachment',
  "content_type" varchar(200) NOT NULL DEFAULT 'application/octet-stream',
  "size_bytes" integer NOT NULL DEFAULT 0,
  "storage_key" text NOT NULL DEFAULT '',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_email_threads_id_fk"
    FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_message_id_email_messages_id_fk"
    FOREIGN KEY ("message_id") REFERENCES "email_messages"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "email_threads_last_msg_idx" ON "email_threads" ("last_message_at");
CREATE INDEX IF NOT EXISTS "email_threads_counterparty_idx" ON "email_threads" ("counterparty_email");
CREATE INDEX IF NOT EXISTS "email_threads_norm_subject_idx" ON "email_threads" ("normalized_subject");
CREATE INDEX IF NOT EXISTS "email_threads_inbox_idx" ON "email_threads" ("has_inbound");
CREATE INDEX IF NOT EXISTS "email_threads_sent_idx" ON "email_threads" ("has_sent");
CREATE INDEX IF NOT EXISTS "email_threads_draft_idx" ON "email_threads" ("has_draft");
CREATE INDEX IF NOT EXISTS "email_threads_failed_idx" ON "email_threads" ("has_failed");

CREATE INDEX IF NOT EXISTS "email_messages_thread_idx" ON "email_messages" ("thread_id");
CREATE INDEX IF NOT EXISTS "email_messages_direction_idx" ON "email_messages" ("direction");
CREATE INDEX IF NOT EXISTS "email_messages_status_idx" ON "email_messages" ("status");
CREATE INDEX IF NOT EXISTS "email_messages_resend_idx" ON "email_messages" ("resend_id");
CREATE INDEX IF NOT EXISTS "email_messages_message_id_idx" ON "email_messages" ("message_id");
CREATE INDEX IF NOT EXISTS "email_messages_created_idx" ON "email_messages" ("created_at");

CREATE INDEX IF NOT EXISTS "email_attachments_message_idx" ON "email_attachments" ("message_id");
