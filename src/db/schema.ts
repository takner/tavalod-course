import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Money columns are int8 read as JS bigint — never as number.
const money = (name: string) => bigint(name, { mode: "bigint" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const inviteKind = pgEnum("invite_kind", ["group", "claim"]);
export const eventType = pgEnum("event_type", ["trip", "birthday", "gathering", "charity", "other"]);
export const eventStatus = pgEnum("event_status", ["planned", "active", "closed", "cancelled"]);
export const participantStatus = pgEnum("participant_status", ["invited", "going", "declined", "maybe"]);
export const splitType = pgEnum("split_type", ["equal", "exact", "percent", "shares"]);
export const expenseKind = pgEnum("expense_kind", ["expense", "refund"]);
export const expenseCategory = pgEnum("expense_category", [
  "accommodation",
  "food",
  "fuel",
  "transport",
  "fun",
  "gift",
  "shopping",
  "other",
  "cake",
  "venue",
]);
export const settlementStatus = pgEnum("settlement_status", ["pending", "confirmed", "rejected"]);
export const settlementMethod = pgEnum("settlement_method", ["cash", "bank_transfer", "other"]);
/** collection = money handed to a gift holder before purchase; refund = holder paying it back. */
export const settlementPurpose = pgEnum("settlement_purpose", ["settle", "collection", "refund"]);
export const birthCalendar = pgEnum("birth_calendar", ["jalali", "gregorian"]);
export const giftStatus = pgEnum("gift_status", ["proposed", "collecting", "ready_to_buy", "purchased", "delivered", "cancelled"]);
export const pledgeStatus = pgEnum("pledge_status", ["invited", "pledged", "declined"]);
export const pollKind = pgEnum("poll_kind", ["datetime", "place", "activity", "budget", "gift", "custom"]);
export const pollStatus = pgEnum("poll_status", ["open", "closed"]);
/** public: everyone allowed sees who chose what. aggregate: only totals are ever shown. */
export const pollResultsMode = pgEnum("poll_results_mode", ["public", "aggregate"]);
export const wishlistItemKind = pgEnum("wishlist_item_kind", ["product", "digital", "ticket", "experience", "other"]);
export const wishlistItemStatus = pgEnum("wishlist_item_status", ["wanted", "received", "not_wanted"]);
export const reservationStatus = pgEnum("reservation_status", ["active", "purchased", "released", "expired"]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// ───────────────────────── auth ─────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /** Yearly birthday in the person's own calendar (no drift between calendars). */
    birthCalendar: birthCalendar("birth_calendar"),
    birthMonth: integer("birth_month"),
    birthDay: integer("birth_day"),
    birthYear: integer("birth_year"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    check(
      "users_birthday_complete",
      sql`(${t.birthCalendar} is null) = (${t.birthMonth} is null) and (${t.birthMonth} is null) = (${t.birthDay} is null)`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

/** One-time magic-link tokens. Only the SHA-256 hash is stored. */
export const loginTokens = pgTable(
  "login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** Where to send the user after login (relative path only). */
    nextPath: text("next_path"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** Set once the token has been used up (uses = max_uses). */
    usedAt: timestamp("used_at", { withTimezone: true }),
    /** Emailed links are single-use; operator-issued links may allow a few uses (browser + installed app). */
    maxUses: integer("max_uses").notNull().default(1),
    uses: integer("uses").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("login_tokens_hash_uq").on(t.tokenHash), index("login_tokens_email_idx").on(t.email, t.createdAt)],
);

// ───────────────────────── groups ─────────────────────────

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/**
 * All money references point at a member, not a user, so a guest without an account can owe or be
 * owed. A guest is later bound to a real user only through a single-use `claim` invite.
 */
export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id),
    displayName: text("display_name").notNull(),
    role: memberRole("role").notNull().default("member"),
    joinedAt: createdAt(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("group_members_user_uq").on(t.groupId, t.userId),
    index("group_members_group_idx").on(t.groupId),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    kind: inviteKind("kind").notNull(),
    claimMemberId: uuid("claim_member_id").references(() => groupMembers.id),
    /** Optional: if set, only a user signed in with this email can use the invite. */
    email: text("email"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxUses: integer("max_uses").notNull(),
    uses: integer("uses").notNull().default(0),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invites_token_uq").on(t.tokenHash),
    check("invites_claim_consistency", sql`(${t.kind} = 'claim') = (${t.claimMemberId} is not null)`),
    check("invites_claim_single_use", sql`${t.kind} <> 'claim' or ${t.maxUses} = 1`),
    check("invites_uses_le_max", sql`${t.uses} <= ${t.maxUses}`),
  ],
);

// ───────────────────────── events ─────────────────────────

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: eventType("type").notNull().default("other"),
    status: eventStatus("status").notNull().default("planned"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    description: text("description"),
    /** Exact start instant (UTC). Shown in `timezone`; start_date mirrors its local day. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    timezone: text("timezone").notNull().default("Asia/Tehran"),
    locationName: text("location_name"),
    locationNote: text("location_note"),
    mapUrl: text("map_url"),
    rsvpDeadline: timestamp("rsvp_deadline", { withTimezone: true }),
    /** The person whose birthday it is; never allowed into a surprise space of this event. */
    celebrantMemberId: uuid("celebrant_member_id").references((): AnyPgColumn => groupMembers.id),
    /** Organiser's override of the confirmed headcount (null = derive from RSVPs). */
    finalAdults: integer("final_adults"),
    finalChildren: integer("final_children"),
    cakeAdultGrams: integer("cake_adult_grams").notNull().default(150),
    cakeChildGrams: integer("cake_child_grams").notNull().default(100),
    cakeMarginBp: integer("cake_margin_bp").notNull().default(1000),
    cakeRoundStepGrams: integer("cake_round_step_grams").notNull().default(500),
    /** Final cake order chosen by the organiser (the estimate is only a suggestion). */
    cakeOrderGrams: integer("cake_order_grams"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("events_group_idx").on(t.groupId)],
);

export const eventBudgets = pgTable(
  "event_budgets",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    amount: money("amount").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.category] }),
    check("event_budgets_category", sql`${t.category} in ('food','cake','venue','other')`),
    check("event_budgets_amount", sql`${t.amount} >= 0`),
  ],
);

export const eventParticipants = pgTable(
  "event_participants",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    status: participantStatus("status").notNull().default("going"),
    /** Companions are statistical guests: they count for catering, never for money. */
    adultCompanions: integer("adult_companions").notNull().default(0),
    childCompanions: integer("child_companions").notNull().default(0),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.memberId] }),
    check("event_participants_companions", sql`${t.adultCompanions} between 0 and 50 and ${t.childCompanions} between 0 and 50`),
  ],
);

// ───────────────────────── money ─────────────────────────

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id),
    title: text("title").notNull(),
    category: expenseCategory("category").notNull().default("other"),
    totalAmount: money("total_amount").notNull(),
    date: date("date").notNull(),
    splitType: splitType("split_type").notNull(),
    kind: expenseKind("kind").notNull().default("expense"),
    refundOfExpenseId: uuid("refund_of_expense_id").references((): AnyPgColumn => expenses.id),
    note: text("note"),
    /** Set for expenses inside a private (surprise) space: excluded from the public group ledger. */
    spaceId: uuid("space_id").references((): AnyPgColumn => privateSpaces.id),
    giftId: uuid("gift_id").references((): AnyPgColumn => gifts.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_group_idx").on(t.groupId),
    index("expenses_event_idx").on(t.eventId),
    index("expenses_refund_of_idx").on(t.refundOfExpenseId),
    check("expenses_total_positive", sql`${t.totalAmount} > 0`),
    check("expenses_refund_link", sql`(${t.kind} = 'refund') = (${t.refundOfExpenseId} is not null)`),
  ],
);

export const expensePayers = pgTable(
  "expense_payers",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    amount: money("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] }), check("expense_payers_positive", sql`${t.amount} > 0`)],
);

export const expenseShares = pgTable(
  "expense_shares",
  {
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    /** What the user entered: Toman (exact), basis points (percent), weight×100 (shares), 0 (equal). */
    inputValue: bigint("input_value", { mode: "bigint" }).notNull().default(sql`0`),
    amount: money("amount").notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] }), check("expense_shares_non_negative", sql`${t.amount} >= 0`)],
);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMemberId: uuid("from_member_id")
      .notNull()
      .references(() => groupMembers.id),
    toMemberId: uuid("to_member_id")
      .notNull()
      .references(() => groupMembers.id),
    amount: money("amount").notNull(),
    method: settlementMethod("method").notNull().default("bank_transfer"),
    note: text("note"),
    spaceId: uuid("space_id").references((): AnyPgColumn => privateSpaces.id),
    giftId: uuid("gift_id").references((): AnyPgColumn => gifts.id),
    purpose: settlementPurpose("purpose").notNull().default("settle"),
    status: settlementStatus("status").notNull().default("pending"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("settlements_group_idx").on(t.groupId),
    check("settlements_amount_positive", sql`${t.amount} > 0`),
    check("settlements_distinct_parties", sql`${t.fromMemberId} <> ${t.toMemberId}`),
  ],
);

/** Which event (or the general bucket, event_id null) each part of a settlement pays down. */
export const settlementAllocations = pgTable(
  "settlement_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settlementId: uuid("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id),
    amount: money("amount").notNull(),
  },
  (t) => [
    unique("settlement_allocations_scope_uq").on(t.settlementId, t.eventId).nullsNotDistinct(),
    check("settlement_allocations_positive", sql`${t.amount} > 0`),
  ],
);

// ───────────────────────── infrastructure ─────────────────────────

/**
 * Idempotency for create operations (online and offline-queued). A key is scoped to
 * (user, group, operation); replaying it with a different payload is a conflict.
 */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    resultId: uuid("result_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("idempotency_scope_uq").on(t.userId, t.groupId, t.operation, t.key)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    before: jsonb("before"),
    after: jsonb("after"),
    /** Entries of a private space are never shown in the group's public activity. */
    spaceId: uuid("space_id").references((): AnyPgColumn => privateSpaces.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_group_idx").on(t.groupId, t.at)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    spaceId: uuid("space_id").references((): AnyPgColumn => privateSpaces.id, { onDelete: "cascade" }),
    /** Reminders carry a key so the same reminder is never created twice for a user. */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.userId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

// ───────────────────────── phase 2: logistics ─────────────────────────

export const eventTasks = pgTable(
  "event_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** Tasks inside a surprise space are visible to its members only. */
    spaceId: uuid("space_id").references((): AnyPgColumn => privateSpaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    assigneeMemberId: uuid("assignee_member_id").references(() => groupMembers.id),
    dueDate: date("due_date"),
    done: boolean("done").notNull().default(false),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("event_tasks_event_idx").on(t.eventId)],
);

// ───────────────────────── phase 2: surprise spaces & gifts ─────────────────────────

export const privateSpaces = pgTable(
  "private_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("private_spaces_event_idx").on(t.eventId)],
);

export const privateSpaceMembers = pgTable(
  "private_space_members",
  {
    spaceId: uuid("space_id")
      .notNull()
      .references(() => privateSpaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.memberId] }), index("private_space_members_member_idx").on(t.memberId)],
);

export const spaceMessages = pgTable(
  "space_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => privateSpaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("space_messages_space_idx").on(t.spaceId, t.createdAt)],
);

export const gifts = pgTable(
  "gifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => privateSpaces.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    wishlistItemId: uuid("wishlist_item_id").references((): AnyPgColumn => wishlistItems.id),
    productUrl: text("product_url"),
    budget: money("budget"),
    contributionDeadline: timestamp("contribution_deadline", { withTimezone: true }),
    buyerMemberId: uuid("buyer_member_id")
      .notNull()
      .references(() => groupMembers.id),
    status: giftStatus("status").notNull().default("proposed"),
    purchaseExpenseId: uuid("purchase_expense_id").references((): AnyPgColumn => expenses.id),
    receiptFileId: uuid("receipt_file_id").references((): AnyPgColumn => files.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gifts_space_idx").on(t.spaceId), check("gifts_budget", sql`${t.budget} is null or ${t.budget} >= 0`)],
);

/** A pledge is a promise and a cap; it never moves money and never creates debt by itself. */
export const giftPledges = pgTable(
  "gift_pledges",
  {
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    status: pledgeStatus("status").notNull().default("invited"),
    amount: money("amount"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.giftId, t.memberId] }),
    check("gift_pledges_amount", sql`(${t.status} = 'pledged') = (${t.amount} is not null) and (${t.amount} is null or ${t.amount} > 0)`),
  ],
);

/** A contributor's explicit choice to count money already with the holder toward another gift. */
export const giftReallocations = pgTable("gift_reallocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id")
    .notNull()
    .references(() => groupMembers.id),
  fromGiftId: uuid("from_gift_id")
    .notNull()
    .references(() => gifts.id),
  toGiftId: uuid("to_gift_id")
    .notNull()
    .references(() => gifts.id),
  amount: money("amount").notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

// ───────────────────────── phase 2: polls ─────────────────────────

export const polls = pgTable(
  "polls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references((): AnyPgColumn => privateSpaces.id, { onDelete: "cascade" }),
    kind: pollKind("kind").notNull(),
    question: text("question").notNull(),
    multi: boolean("multi").notNull().default(false),
    resultsMode: pollResultsMode("results_mode").notNull().default("public"),
    deadline: timestamp("deadline", { withTimezone: true }),
    status: pollStatus("status").notNull().default("open"),
    decidedOptionId: uuid("decided_option_id"),
    decisionNote: text("decision_note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("polls_group_idx").on(t.groupId), index("polls_event_idx").on(t.eventId)],
);

export const pollOptions = pgTable(
  "poll_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** For date/time polls: the proposed instant (UTC). */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [index("poll_options_poll_idx").on(t.pollId)],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: uuid("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    optionId: uuid("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.pollId, t.memberId, t.optionId] })],
);

// ───────────────────────── phase 2: wishlists ─────────────────────────

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => users.id),
  purpose: text("purpose").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  data: bytea("data").notNull(),
  createdAt: createdAt(),
});

export const wishlists = pgTable(
  "wishlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    description: text("description"),
    /** SHA-256 of the share-link token; null = no public link. Rotating/clearing revokes the old link. */
    shareTokenHash: text("share_token_hash"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("wishlists_owner_idx").on(t.ownerUserId), uniqueIndex("wishlists_share_uq").on(t.shareTokenHash)],
);

export const wishlistGroups = pgTable(
  "wishlist_groups",
  {
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.wishlistId, t.groupId] }), index("wishlist_groups_group_idx").on(t.groupId)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wishlistId: uuid("wishlist_id")
      .notNull()
      .references(() => wishlists.id, { onDelete: "cascade" }),
    kind: wishlistItemKind("kind").notNull().default("product"),
    title: text("title").notNull(),
    description: text("description"),
    imageFileId: uuid("image_file_id").references(() => files.id),
    brand: text("brand"),
    model: text("model"),
    color: text("color"),
    size: text("size"),
    specs: text("specs"),
    productUrl: text("product_url"),
    /** 1 = high, 2 = medium, 3 = low. */
    priority: integer("priority").notNull().default(2),
    status: wishlistItemStatus("status").notNull().default("wanted"),
    acceptsSubstitute: boolean("accepts_substitute").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Soft delete: other people's reservations and purchases keep their history. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("wishlist_items_list_idx").on(t.wishlistId), check("wishlist_items_priority", sql`${t.priority} between 1 and 3`)],
);

export const priceObservations = pgTable(
  "price_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => wishlistItems.id, { onDelete: "cascade" }),
    amount: money("amount").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    /** manual / store_page / receipt … — see src/server/prices/providers.ts */
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("price_observations_item_idx").on(t.itemId, t.observedAt), check("price_observations_amount", sql`${t.amount} > 0`)],
);

export const wishlistReservations = pgTable(
  "wishlist_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => wishlistItems.id),
    reserverUserId: uuid("reserver_user_id")
      .notNull()
      .references(() => users.id),
    /** The group through which the reserver can see the list (coordination context). */
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    giftId: uuid("gift_id").references((): AnyPgColumn => gifts.id),
    status: reservationStatus("status").notNull().default("active"),
    deadline: timestamp("deadline", { withTimezone: true }),
    note: text("note"),
    /** What the item looked like when reserved, so later edits by the owner do not erase it. */
    itemSnapshot: jsonb("item_snapshot").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("wishlist_reservations_item_idx").on(t.itemId),
    // At most one exclusive (active or purchased) reservation per item — enforced by the database.
    uniqueIndex("wishlist_reservations_exclusive_uq").on(t.itemId).where(sql`${t.status} in ('active','purchased')`),
  ],
);
