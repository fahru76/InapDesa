import { addDays, type ISODate } from "./dates";

/**
 * Structured cancellation policies. Refund percentages apply to the stay charges paid
 * (nights + cleaning). Refundable extras — the security deposit and tourism tax — always
 * come back in full when a booking is cancelled before check-in.
 */
export const CANCELLATION_PRESETS = ["flexible", "moderate", "firm", "non_refundable", "custom"] as const;
export type CancellationPreset = (typeof CANCELLATION_PRESETS)[number];

export function isCancellationPreset(v: unknown): v is CancellationPreset {
  return typeof v === "string" && (CANCELLATION_PRESETS as readonly string[]).includes(v);
}

/** Refund `percent` of stay charges when cancelled at least `daysBefore` days before check-in time. Ordered longest first. */
export interface RefundTier {
  daysBefore: number;
  percent: number;
}

export const PRESET_TIERS: Record<Exclude<CancellationPreset, "custom">, RefundTier[]> = {
  flexible: [{ daysBefore: 1, percent: 100 }],
  moderate: [{ daysBefore: 7, percent: 100 }],
  firm: [
    { daysBefore: 30, percent: 100 },
    { daysBefore: 7, percent: 50 },
  ],
  non_refundable: [],
};

export const PRESET_LABELS: Record<CancellationPreset, { label: string; hint: string }> = {
  flexible: { label: "Flexible", hint: "Full refund up to 1 day before check-in" },
  moderate: { label: "Moderate", hint: "Full refund up to 7 days before check-in" },
  firm: { label: "Firm", hint: "Full refund up to 30 days before, 50% up to 7 days before" },
  non_refundable: { label: "Non-refundable", hint: "No refund of stay charges once booked" },
  custom: { label: "Custom text only", hint: "Your own wording; guests don't see refund amounts or dates" },
};

/** What the guest has paid, split into the part a policy can keep and the part that always comes back. */
export interface PaidSplit {
  stayPaid: number;
  extrasPaid: number;
}

export interface PaymentSnapshot {
  amount_paid: number;
  total_amount: number;
  security_deposit: number;
  tourism_tax?: number;
  payment_policy: "deposit" | "full";
}

/** Split an amount paid. Extras (security deposit + tourism tax) are collected up front only under "full", or once the balance is paid. */
export function splitPaid(b: PaymentSnapshot): PaidSplit {
  const extras = b.security_deposit + (b.tourism_tax ?? 0);
  const extrasCollected = b.payment_policy === "full" || b.amount_paid >= b.total_amount;
  const extrasPaid = extrasCollected ? Math.min(extras, b.amount_paid) : 0;
  return { stayPaid: Math.max(0, b.amount_paid - extrasPaid), extrasPaid };
}

/** Same split for the amount due today at checkout (before anything is paid). */
export function splitDueNow(q: { dueNow: number; securityDeposit: number; tourismTax?: number; policy: "deposit" | "full" }): PaidSplit {
  const extras = q.policy === "full" ? q.securityDeposit + (q.tourismTax ?? 0) : 0;
  return { stayPaid: q.dueNow - extras, extrasPaid: extras };
}

export interface ScheduleStep {
  /** Last moment this refund applies (local date + time at the property). null = from the previous deadline until check-in. */
  until: { date: ISODate; time: string } | null;
  percent: number;
  refund: number;
}

/** Refund timeline for a booking. Empty for "custom" (free-text policy). */
export function refundSchedule(preset: CancellationPreset, checkIn: ISODate, checkInTime: string, paid: PaidSplit): ScheduleStep[] {
  if (preset === "custom") return [];
  const time = checkInTime.slice(0, 5);
  const steps: ScheduleStep[] = PRESET_TIERS[preset].map((tier) => ({
    until: { date: addDays(checkIn, -tier.daysBefore), time },
    percent: tier.percent,
    refund: paid.extrasPaid + Math.round((paid.stayPaid * tier.percent) / 100),
  }));
  steps.push({ until: null, percent: 0, refund: paid.extrasPaid });
  return steps;
}

/** Convert a wall-clock time in a time zone to a UTC instant. */
export function zonedTimeToUtc(date: ISODate, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - ms;
  };
  let ts = guess - offsetAt(guess);
  ts = guess - offsetAt(ts); // second pass settles DST edges
  return new Date(ts);
}

/** The refund that applies if the booking is cancelled at `now`. Returns null for "custom". */
export function refundAt(
  preset: CancellationPreset,
  checkIn: ISODate,
  checkInTime: string,
  timeZone: string,
  paid: PaidSplit,
  now: Date = new Date(),
): { percent: number; refund: number } | null {
  const steps = refundSchedule(preset, checkIn, checkInTime, paid);
  if (steps.length === 0) return null;
  for (const s of steps) {
    if (!s.until) return { percent: s.percent, refund: s.refund };
    if (now.getTime() <= zonedTimeToUtc(s.until.date, s.until.time, timeZone).getTime()) return { percent: s.percent, refund: s.refund };
  }
  return { percent: 0, refund: paid.extrasPaid };
}
