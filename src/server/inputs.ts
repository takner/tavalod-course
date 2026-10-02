import { z } from "zod";
import { AMOUNT_STRING_RE, MAX_AMOUNT } from "@/domain/money";
import { SPLIT_TYPES } from "@/domain/split";

/**
 * Wire formats. Money and other exact integers travel as decimal strings and become bigint here.
 * These schemas are shared by server actions and the /api/sync endpoint.
 */
export const amountString = z
  .string()
  .regex(AMOUNT_STRING_RE, "مبلغ باید عدد صحیح باشد.")
  .transform((s) => BigInt(s))
  .refine((v) => v > 0n && v <= MAX_AMOUNT, "مبلغ باید بیشتر از صفر و در محدوده مجاز باشد.");

export const intString = z
  .string()
  .regex(/^\d+$/, "مقدار باید عدد صحیح نامنفی باشد.")
  .transform((s) => BigInt(s))
  .refine((v) => v <= MAX_AMOUNT, "مقدار بیش از حد مجاز است.");

export const id = z.uuid({ message: "شناسه معتبر نیست." });

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاریخ معتبر نیست.")
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "تاریخ معتبر نیست.");

export const EXPENSE_CATEGORIES = [
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
] as const;

export const expenseInput = z
  .object({
    groupId: id,
    eventId: id.nullable(),
    title: z.string().trim().min(1, "عنوان هزینه را وارد کنید.").max(120),
    category: z.enum(EXPENSE_CATEGORIES),
    date: isoDate,
    totalAmount: amountString,
    splitType: z.enum(SPLIT_TYPES),
    payers: z.array(z.object({ memberId: id, amount: amountString })).min(1, "پرداخت‌کننده را مشخص کنید.").max(50),
    shares: z.array(z.object({ memberId: id, value: intString })).min(1, "افراد سهیم را مشخص کنید.").max(50),
    note: z.string().trim().max(500).optional(),
    /** Private (surprise) space; omitted/null = public group ledger. */
    spaceId: id.nullable().optional(),
  })
  .strict();
export type ExpenseInput = z.infer<typeof expenseInput>;
export type ExpenseWire = z.input<typeof expenseInput>;

export const refundInput = z
  .object({
    expenseId: id,
    amount: amountString,
    date: isoDate,
    note: z.string().trim().max(500).optional(),
    /** Optional overrides; default is proportional to the original expense. */
    receivers: z.array(z.object({ memberId: id, amount: amountString })).min(1).max(50).optional(),
  })
  .strict();
export type RefundInput = z.infer<typeof refundInput>;

export const allocationInput = z.object({ eventId: id.nullable(), amount: amountString });

export const settlementInput = z
  .object({
    groupId: id,
    fromMemberId: id,
    toMemberId: id,
    amount: amountString,
    method: z.enum(["cash", "bank_transfer", "other"]),
    note: z.string().trim().max(500).optional(),
    /** Optional explicit allocation; default is the deterministic auto-allocation. */
    allocations: z.array(allocationInput).min(1).max(100).optional(),
    spaceId: id.nullable().optional(),
    giftId: id.nullable().optional(),
    purpose: z.enum(["settle", "collection", "refund"]).optional(),
  })
  .strict()
  .refine((s) => s.fromMemberId !== s.toMemberId, "پرداخت‌کننده و دریافت‌کننده نباید یکی باشند.");
export type SettlementInput = z.infer<typeof settlementInput>;
export type SettlementWire = z.input<typeof settlementInput>;

export const EVENT_TYPES = ["trip", "birthday", "gathering", "charity", "other"] as const;

export const eventInput = z
  .object({
    groupId: id,
    title: z.string().trim().min(1, "عنوان رویداد را وارد کنید.").max(120),
    type: z.enum(EVENT_TYPES),
    startDate: isoDate.nullable(),
    endDate: isoDate.nullable(),
    participantMemberIds: z.array(id).max(100),
  })
  .strict()
  .refine((e) => !e.startDate || !e.endDate || e.startDate <= e.endDate, "تاریخ پایان نباید قبل از شروع باشد.");
export type EventInput = z.infer<typeof eventInput>;

export const displayName = z.string().trim().min(1, "نام را وارد کنید.").max(60, "نام طولانی است.");
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "ایمیل معتبر نیست." }))
  .refine((s) => s.length <= 254, "ایمیل معتبر نیست.");
