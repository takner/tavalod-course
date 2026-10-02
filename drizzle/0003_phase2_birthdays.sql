CREATE TYPE "public"."birth_calendar" AS ENUM('jalali', 'gregorian');--> statement-breakpoint
CREATE TYPE "public"."gift_status" AS ENUM('proposed', 'collecting', 'ready_to_buy', 'purchased', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pledge_status" AS ENUM('invited', 'pledged', 'declined');--> statement-breakpoint
CREATE TYPE "public"."poll_kind" AS ENUM('datetime', 'place', 'activity', 'budget', 'gift', 'custom');--> statement-breakpoint
CREATE TYPE "public"."poll_results_mode" AS ENUM('public', 'aggregate');--> statement-breakpoint
CREATE TYPE "public"."poll_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'purchased', 'released', 'expired');--> statement-breakpoint
CREATE TYPE "public"."settlement_purpose" AS ENUM('settle', 'collection', 'refund');--> statement-breakpoint
CREATE TYPE "public"."wishlist_item_kind" AS ENUM('product', 'digital', 'ticket', 'experience', 'other');--> statement-breakpoint
CREATE TYPE "public"."wishlist_item_status" AS ENUM('wanted', 'received', 'not_wanted');--> statement-breakpoint
ALTER TYPE "public"."expense_category" ADD VALUE 'cake';--> statement-breakpoint
ALTER TYPE "public"."expense_category" ADD VALUE 'venue';--> statement-breakpoint
ALTER TYPE "public"."participant_status" ADD VALUE 'maybe';--> statement-breakpoint
CREATE TABLE "event_budgets" (
	"event_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "event_budgets_event_id_category_pk" PRIMARY KEY("event_id","category"),
	CONSTRAINT "event_budgets_category" CHECK ("event_budgets"."category" in ('food','cake','venue','other')),
	CONSTRAINT "event_budgets_amount" CHECK ("event_budgets"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "event_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"space_id" uuid,
	"title" text NOT NULL,
	"assignee_member_id" uuid,
	"due_date" date,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_pledges" (
	"gift_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"status" "pledge_status" DEFAULT 'invited' NOT NULL,
	"amount" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_pledges_gift_id_member_id_pk" PRIMARY KEY("gift_id","member_id"),
	CONSTRAINT "gift_pledges_amount" CHECK (("gift_pledges"."status" = 'pledged') = ("gift_pledges"."amount" is not null) and ("gift_pledges"."amount" is null or "gift_pledges"."amount" > 0))
);
--> statement-breakpoint
CREATE TABLE "gift_reallocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"from_gift_id" uuid NOT NULL,
	"to_gift_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"wishlist_item_id" uuid,
	"product_url" text,
	"budget" bigint,
	"contribution_deadline" timestamp with time zone,
	"buyer_member_id" uuid NOT NULL,
	"status" "gift_status" DEFAULT 'proposed' NOT NULL,
	"purchase_expense_id" uuid,
	"receipt_file_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gifts_budget" CHECK ("gifts"."budget" is null or "gifts"."budget" >= 0)
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_at" timestamp with time zone,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_poll_id_member_id_option_id_pk" PRIMARY KEY("poll_id","member_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"event_id" uuid,
	"space_id" uuid,
	"kind" "poll_kind" NOT NULL,
	"question" text NOT NULL,
	"multi" boolean DEFAULT false NOT NULL,
	"results_mode" "poll_results_mode" DEFAULT 'public' NOT NULL,
	"deadline" timestamp with time zone,
	"status" "poll_status" DEFAULT 'open' NOT NULL,
	"decided_option_id" uuid,
	"decision_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "price_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source" text NOT NULL,
	"source_url" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_observations_amount" CHECK ("price_observations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "private_space_members" (
	"space_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "private_space_members_space_id_member_id_pk" PRIMARY KEY("space_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "private_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_groups" (
	"wishlist_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "wishlist_groups_wishlist_id_group_id_pk" PRIMARY KEY("wishlist_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "wishlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wishlist_id" uuid NOT NULL,
	"kind" "wishlist_item_kind" DEFAULT 'product' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"image_file_id" uuid,
	"brand" text,
	"model" text,
	"color" text,
	"size" text,
	"specs" text,
	"product_url" text,
	"priority" integer DEFAULT 2 NOT NULL,
	"status" "wishlist_item_status" DEFAULT 'wanted' NOT NULL,
	"accepts_substitute" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "wishlist_items_priority" CHECK ("wishlist_items"."priority" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "wishlist_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"reserver_user_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"gift_id" uuid,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"deadline" timestamp with time zone,
	"note" text,
	"item_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"share_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "adult_companions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "child_companions" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "event_participants" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timezone" text DEFAULT 'Asia/Tehran' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_name" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "location_note" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "map_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rsvp_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "celebrant_member_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "final_adults" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "final_children" integer;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cake_adult_grams" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cake_child_grams" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cake_margin_bp" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cake_round_step_grams" integer DEFAULT 500 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cake_order_grams" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "gift_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "space_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "gift_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "purpose" "settlement_purpose" DEFAULT 'settle' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_calendar" "birth_calendar";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_month" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_day" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "event_budgets" ADD CONSTRAINT "event_budgets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_assignee_member_id_group_members_id_fk" FOREIGN KEY ("assignee_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tasks" ADD CONSTRAINT "event_tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_pledges" ADD CONSTRAINT "gift_pledges_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_pledges" ADD CONSTRAINT "gift_pledges_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_reallocations" ADD CONSTRAINT "gift_reallocations_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_reallocations" ADD CONSTRAINT "gift_reallocations_from_gift_id_gifts_id_fk" FOREIGN KEY ("from_gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_reallocations" ADD CONSTRAINT "gift_reallocations_to_gift_id_gifts_id_fk" FOREIGN KEY ("to_gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_reallocations" ADD CONSTRAINT "gift_reallocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_wishlist_item_id_wishlist_items_id_fk" FOREIGN KEY ("wishlist_item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_buyer_member_id_group_members_id_fk" FOREIGN KEY ("buyer_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_purchase_expense_id_expenses_id_fk" FOREIGN KEY ("purchase_expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_receipt_file_id_files_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_item_id_wishlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_observations" ADD CONSTRAINT "price_observations_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_space_members" ADD CONSTRAINT "private_space_members_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_space_members" ADD CONSTRAINT "private_space_members_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_spaces" ADD CONSTRAINT "private_spaces_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_spaces" ADD CONSTRAINT "private_spaces_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private_spaces" ADD CONSTRAINT "private_spaces_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_messages" ADD CONSTRAINT "space_messages_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_messages" ADD CONSTRAINT "space_messages_member_id_group_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_groups" ADD CONSTRAINT "wishlist_groups_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_groups" ADD CONSTRAINT "wishlist_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_wishlist_id_wishlists_id_fk" FOREIGN KEY ("wishlist_id") REFERENCES "public"."wishlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_image_file_id_files_id_fk" FOREIGN KEY ("image_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_reservations" ADD CONSTRAINT "wishlist_reservations_item_id_wishlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wishlist_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_reservations" ADD CONSTRAINT "wishlist_reservations_reserver_user_id_users_id_fk" FOREIGN KEY ("reserver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_reservations" ADD CONSTRAINT "wishlist_reservations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_reservations" ADD CONSTRAINT "wishlist_reservations_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlists" ADD CONSTRAINT "wishlists_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_tasks_event_idx" ON "event_tasks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "gifts_space_idx" ON "gifts" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "poll_options_poll_idx" ON "poll_options" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "polls_group_idx" ON "polls" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "polls_event_idx" ON "polls" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "price_observations_item_idx" ON "price_observations" USING btree ("item_id","observed_at");--> statement-breakpoint
CREATE INDEX "private_space_members_member_idx" ON "private_space_members" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "private_spaces_event_idx" ON "private_spaces" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "space_messages_space_idx" ON "space_messages" USING btree ("space_id","created_at");--> statement-breakpoint
CREATE INDEX "wishlist_groups_group_idx" ON "wishlist_groups" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "wishlist_items_list_idx" ON "wishlist_items" USING btree ("wishlist_id");--> statement-breakpoint
CREATE INDEX "wishlist_reservations_item_idx" ON "wishlist_reservations" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_reservations_exclusive_uq" ON "wishlist_reservations" USING btree ("item_id") WHERE "wishlist_reservations"."status" in ('active','purchased');--> statement-breakpoint
CREATE INDEX "wishlists_owner_idx" ON "wishlists" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlists_share_uq" ON "wishlists" USING btree ("share_token_hash");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_celebrant_member_id_group_members_id_fk" FOREIGN KEY ("celebrant_member_id") REFERENCES "public"."group_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_space_id_private_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."private_spaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_companions" CHECK ("event_participants"."adult_companions" between 0 and 50 and "event_participants"."child_companions" between 0 and 50);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_birthday_complete" CHECK (("users"."birth_calendar" is null) = ("users"."birth_month" is null) and ("users"."birth_month" is null) = ("users"."birth_day" is null));