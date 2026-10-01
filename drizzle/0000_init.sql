CREATE TYPE "public"."event_status" AS ENUM('planned', 'active', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('trip', 'birthday', 'gathering', 'charity', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('accommodation', 'food', 'fuel', 'transport', 'fun', 'gift', 'shopping', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_kind" AS ENUM('expense', 'refund');--> statement-breakpoint
CREATE TYPE "public"."invite_kind" AS ENUM('group', 'claim');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('invited', 'going', 'declined');--> statement-breakpoint
CREATE TYPE "public"."settlement_method" AS ENUM('cash', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'exact', 'percent', 'shares');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"event_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "participant_status" DEFAULT 'going' NOT NULL,
	CONSTRAINT "event_participants_event_id_member_id_pk" PRIMARY KEY("event_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"type" "event_type" DEFAULT 'other' NOT NULL,
	"status" "event_status" DEFAULT 'planned' NOT NULL,
	"start_date" date,
	"end_date" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_payers" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "expense_payers_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "expense_payers_positive" CHECK ("expense_payers"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"input_value" bigint DEFAULT 0 NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "expense_shares_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "expense_shares_non_negative" CHECK ("expense_shares"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"event_id" uuid,
	"title" text NOT NULL,
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"total_amount" bigint NOT NULL,
	"date" date NOT NULL,
	"split_type" "split_type" NOT NULL,
	"kind" "expense_kind" DEFAULT 'expense' NOT NULL,
	"refund_of_expense_id" uuid,
	"note" text,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_total_positive" CHECK ("expenses"."total_amount" > 0),
	CONSTRAINT "expenses_refund_link" CHECK (("expenses"."kind" = 'refund') = ("expenses"."refund_of_expense_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"result_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" "invite_kind" NOT NULL,
	"claim_member_id" uuid,
	"email" text,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_claim_consistency" CHECK (("invites"."kind" = 'claim') = ("invites"."claim_member_id" is not null)),
	CONSTRAINT "invites_claim_single_use" CHECK ("invites"."kind" <> 'claim' or "invites"."max_uses" = 1),
	CONSTRAINT "invites_uses_le_max" CHECK ("invites"."uses" <= "invites"."max_uses")
);
--> statement-breakpoint
CREATE TABLE "login_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"next_path" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"group_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlement_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"event_id" uuid,
	"amount" bigint NOT NULL,
	CONSTRAINT "settlement_allocations_scope_uq" UNIQUE NULLS NOT DISTINCT("settlement_id","event_id"),
	CONSTRAINT "settlement_allocations_positive" CHECK ("settlement_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"method" "settlement_method" DEFAULT 'bank_transfer' NOT NULL,
	"note" text,
	"status" "settlement_status" DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_amount_positive" CHECK ("settlements"."amount" > 0),
	CONSTRAINT "settlements_distinct_parties" CHECK ("settlements"."from_member_id" <> "settlements"."to_member_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payers" ADD CONSTRAINT "expense_payers_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_refund_of_expense_id_expenses_id_fk" FOREIGN KEY ("refund_of_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_claim_member_id_group_members_id_fk" FOREIGN KEY ("claim_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_member_id_group_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_member_id_group_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_group_idx" ON "audit_log" USING btree ("group_id","at");--> statement-breakpoint
CREATE INDEX "events_group_idx" ON "events" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "expenses_group_idx" ON "expenses" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "expenses_event_idx" ON "expenses" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "expenses_refund_of_idx" ON "expenses" USING btree ("refund_of_expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_user_uq" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "group_members_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_uq" ON "idempotency_keys" USING btree ("user_id","group_id","operation","key");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_uq" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "login_tokens_hash_uq" ON "login_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "login_tokens_email_idx" ON "login_tokens" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "settlements_group_idx" ON "settlements" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");