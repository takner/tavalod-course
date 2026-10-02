import { DomainError } from "./errors";

/** Aggregate-only polls show results only once this many people have answered. */
export const AGGREGATE_MIN_RESPONDENTS = 3;

export interface PollTallyOption {
  optionId: string;
  count: number;
  /**
   * Share of RESPONDENTS who picked this option, in basis points. In a multi-choice poll these do
   * not add up to 100% — each is "x% of respondents chose this".
   */
  respondentShareBp: number;
}

export interface PollTally {
  respondents: number;
  eligible: number;
  nonRespondentIds: string[];
  options: PollTallyOption[];
  /** Option ids with the highest count (ties keep all). Empty when nobody answered. */
  leaders: string[];
}

export function tallyPoll(
  optionIds: string[],
  votes: { memberId: string; optionId: string }[],
  eligibleMemberIds: string[],
): PollTally {
  const eligible = new Set(eligibleMemberIds);
  const counted = votes.filter((v) => eligible.has(v.memberId) && optionIds.includes(v.optionId));
  const respondents = new Set(counted.map((v) => v.memberId));
  const counts = new Map(optionIds.map((id) => [id, 0]));
  for (const v of counted) counts.set(v.optionId, (counts.get(v.optionId) ?? 0) + 1);
  const options = optionIds.map((optionId) => {
    const count = counts.get(optionId) ?? 0;
    return {
      optionId,
      count,
      respondentShareBp: respondents.size === 0 ? 0 : Math.round((count * 10_000) / respondents.size),
    };
  });
  const max = Math.max(0, ...options.map((o) => o.count));
  return {
    respondents: respondents.size,
    eligible: eligible.size,
    nonRespondentIds: [...eligible].filter((id) => !respondents.has(id)),
    options,
    leaders: max === 0 ? [] : options.filter((o) => o.count === max).map((o) => o.optionId),
  };
}

/** Validates one member's ballot: known options, no duplicates, single-choice means exactly one. */
export function validateBallot(optionIds: string[], chosen: string[], multi: boolean): string[] {
  const unique = [...new Set(chosen)];
  if (unique.length === 0) throw new DomainError("poll.empty_vote", "حداقل یک گزینه را انتخاب کنید.");
  if (!multi && unique.length > 1) throw new DomainError("poll.single_choice", "در این نظرسنجی فقط یک گزینه قابل انتخاب است.");
  for (const id of unique) {
    if (!optionIds.includes(id)) throw new DomainError("poll.unknown_option", "گزینه انتخاب‌شده معتبر نیست.");
  }
  return unique;
}

export function isPollOpen(poll: { status: "open" | "closed"; deadline: Date | null }, now = new Date()): boolean {
  return poll.status === "open" && (!poll.deadline || poll.deadline.getTime() > now.getTime());
}
