ALTER TABLE "login_tokens" ADD COLUMN "max_uses" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "login_tokens" ADD COLUMN "uses" integer DEFAULT 0 NOT NULL;