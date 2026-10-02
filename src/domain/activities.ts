/**
 * Generic, editable activity templates. They describe kinds of plans, never real venues, prices,
 * opening hours or availability. Budget figures are rough per-person ranges the group can edit.
 */
export interface ActivityTemplate {
  id: string;
  title: string;
  description: string;
  eventType: "gathering" | "birthday" | "trip" | "other";
  minPeople: number;
  maxPeople: number;
  /** Rough per-person budget range in Toman (illustrative; edit to your situation). */
  budgetPerPerson: [bigint, bigint];
  familyFriendly: boolean;
  alcoholFree: boolean;
  gamblingFree: boolean;
  setting: "indoor" | "outdoor";
  checklist: string[];
}

export const ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  {
    id: "home-party",
    title: "دورهمی خانگی",
    description: "شام یا عصرانه در خانه یکی از دوستان، با موسیقی و گپ. ساده و کم‌هزینه.",
    eventType: "gathering",
    minPeople: 3,
    maxPeople: 25,
    budgetPerPerson: [150_000n, 600_000n],
    familyFriendly: true,
    alcoholFree: true,
    gamblingFree: true,
    setting: "indoor",
    checklist: ["هماهنگی محل", "تهیه غذا", "خرید نوشیدنی و میوه", "جمع‌وجور بعد از مهمانی"],
  },
  {
    id: "birthday-home",
    title: "جشن تولد خانگی",
    description: "تولد در خانه با کیک، تزیین ساده و هدیه گروهی.",
    eventType: "birthday",
    minPeople: 4,
    maxPeople: 30,
    budgetPerPerson: [250_000n, 900_000n],
    familyFriendly: true,
    alcoholFree: true,
    gamblingFree: true,
    setting: "indoor",
    checklist: ["خرید کیک", "خرید هدیه", "تزیین", "تهیه غذا", "هماهنگی محل"],
  },
  {
    id: "picnic",
    title: "پیک‌نیک",
    description: "پارک یا طبیعت نزدیک شهر؛ هر کس یک خوراکی می‌آورد.",
    eventType: "gathering",
    minPeople: 3,
    maxPeople: 40,
    budgetPerPerson: [100_000n, 400_000n],
    familyFriendly: true,
    alcoholFree: true,
    gamblingFree: true,
    setting: "outdoor",
    checklist: ["انتخاب محل", "زیرانداز و وسایل", "تقسیم خوراکی‌ها", "بررسی هوا"],
  },
  {
    id: "hike",
    title: "پیاده‌روی / کوه‌پیمایی سبک",
    description: "مسیر ساده صبح جمعه و صبحانه بعد از آن. سطح مسیر را با کم‌تجربه‌ترین نفر تنظیم کنید.",
    eventType: "trip",
    minPeople: 2,
    maxPeople: 20,
    budgetPerPerson: [50_000n, 300_000n],
    familyFriendly: true,
    alcoholFree: true,
    gamblingFree: true,
    setting: "outdoor",
    checklist: ["انتخاب مسیر", "هماهنگی رفت‌وآمد", "صبحانه", "کیف کمک‌های اولیه"],
  },
  {
    id: "sports",
    title: "ورزش گروهی",
    description: "فوتسال، والیبال یا بدمینتون؛ زمین را به‌صورت ساعتی رزرو کنید و هزینه را تقسیم کنید.",
    eventType: "gathering",
    minPeople: 4,
    maxPeople: 16,
    budgetPerPerson: [100_000n, 400_000n],
    familyFriendly: false,
    alcoholFree: true,
    gamblingFree: true,
    setting: "indoor",
    checklist: ["رزرو زمین", "تقسیم تیم‌ها", "آب و خوراکی"],
  },
  {
    id: "board-games",
    title: "شب بازی گروهی",
    description: "بازی‌های رومیزی و گروهی (مثل مافیا یا بازی‌های کارتی بدون شرط‌بندی).",
    eventType: "gathering",
    minPeople: 4,
    maxPeople: 14,
    budgetPerPerson: [100_000n, 500_000n],
    familyFriendly: true,
    alcoholFree: true,
    gamblingFree: true,
    setting: "indoor",
    checklist: ["انتخاب بازی‌ها", "هماهنگی محل", "خوراکی"],
  },
  {
    id: "cultural",
    title: "برنامه فرهنگی",
    description: "سینما، تئاتر یا نمایشگاه و بعد شام. بلیت و ساعت را از منبع رسمی همان برنامه بررسی کنید.",
    eventType: "gathering",
    minPeople: 2,
    maxPeople: 20,
    budgetPerPerson: [300_000n, 1_200_000n],
    familyFriendly: true,
    alcoholFree: true,
    gamblingFree: true,
    setting: "indoor",
    checklist: ["انتخاب برنامه", "خرید بلیت", "رزرو شام"],
  },
];

export interface ActivityFilter {
  people?: number;
  /** Max per-person budget the group is comfortable with. */
  maxBudgetPerPerson?: bigint;
  familyFriendly?: boolean;
  alcoholFree?: boolean;
  gamblingFree?: boolean;
  setting?: "indoor" | "outdoor";
}

export function filterActivities(filter: ActivityFilter, templates = ACTIVITY_TEMPLATES): ActivityTemplate[] {
  return templates.filter(
    (t) =>
      (filter.people === undefined || (filter.people >= t.minPeople && filter.people <= t.maxPeople)) &&
      (filter.maxBudgetPerPerson === undefined || t.budgetPerPerson[0] <= filter.maxBudgetPerPerson) &&
      (!filter.familyFriendly || t.familyFriendly) &&
      (!filter.alcoholFree || t.alcoholFree) &&
      (!filter.gamblingFree || t.gamblingFree) &&
      (!filter.setting || t.setting === filter.setting),
  );
}
