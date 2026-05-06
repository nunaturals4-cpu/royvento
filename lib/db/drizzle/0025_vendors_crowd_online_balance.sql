ALTER TABLE "vendors" ADD COLUMN "crowd_level" varchar(20);
--> statement-breakpoint
ALTER TABLE "vendors" ADD COLUMN "online_balance" numeric(14, 2) DEFAULT '0' NOT NULL;
