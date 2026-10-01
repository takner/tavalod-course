import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
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
export const participantStatus = pgEnum("participant_status", ["invited", "going", "declined"]);
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
]);
export const settlementStatus = pgEnum("settlement_status", ["pending", "confirmed", "rejected"]);
export const settlementMethod = pgEnum("settlement_method", ["cash", "bank_transfer", "other"]);

// ───────────────────────── auth ─────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
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
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("events_group_idx").on(t.groupId)],
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
  },
  (t) => [primaryKey({ columns: [t.eventId, t.memberId] })],
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
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);
