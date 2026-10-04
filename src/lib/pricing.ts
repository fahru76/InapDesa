import { diffDays, eachNight, isISODate, isoDayOfWeek, type ISODate } from "./dates";
import type { Locale } from "./content";
import type { PaymentPolicy } from "./database.types";
import { translate, translatePlural, type MessageKey } from "./i18n";

/** The subset of a property needed to price a stay. A `properties` row satisfies this. */
export interface PricingRules {
  currency: string;
  weekday_rate: number;
  weekend_rate: number;
  weekend_days: number[];
  cleaning_fee: number;
  security_deposit: number;
  min_nights: number;
  max_nights: number;
  payment_policy: PaymentPolicy;
  deposit_percent: number;
  /** Malaysian tourism tax for foreign guests (owner opt-in). Rate is in minor units per room per night. */
  tourism_tax_enabled?: boolean;
  tourism_tax_rate?: number;
  tourism_tax_rooms?: number;
}

export interface CapacityRules {
  max_guests: number;
  max_infants: number;
}

export interface GuestCounts {
  adults: number;
  children: number;
  infants: number;
}

export interface NightlyRate {
  date: ISODate;
  rate: number;
  weekend: boolean;
}

export interface Quote {
  currency: string;
  nights: number;
  nightly: NightlyRate[];
  weekdayNights: number;
  weekendNights: number;
  /** Sum of nightly rates. */
  subtotal: number;
  cleaningFee: number;
  /** Refundable; collected online only under the "full" policy, otherwise at check-in. */
  securityDeposit: number;
  /** Subtotal + cleaning fee (the charges a cancellation policy applies to). */
  stayCharges: number;
  /** Tourism tax for foreign guests (0 when not applicable). Collected with the balance, or today under "full". */
  tourismTax: number;
  /** Everything the guest will pay across the booking, including the refundable deposit. */
  total: number;
  policy: PaymentPolicy;
  depositPercent: number;
  /** Charged online today to lock the dates. */
  dueNow: number;
  /** Collected on check-in (includes the refundable security deposit under the deposit policy). */
  balanceDue: number;
}

export function nightlyRate(rules: PricingRules, night: ISODate): NightlyRate {
  const weekend = rules.weekend_days.includes(isoDayOfWeek(night));
  return { date: night, rate: weekend ? rules.weekend_rate : rules.weekday_rate, weekend };
}

/** Price a stay. Pure and deterministic: the server re-runs this to authorise the charge. */
export function quoteStay(rules: PricingRules, checkIn: ISODate, checkOut: ISODate, opts: { foreignGuest?: boolean } = {}): Quote {
  const nightly = eachNight(checkIn, checkOut).map((n) => nightlyRate(rules, n));
  if (nightly.length === 0) throw new Error("A stay needs at least one night");

  const subtotal = nightly.reduce((sum, n) => sum + n.rate, 0);
  const weekendNights = nightly.filter((n) => n.weekend).length;
  const cleaningFee = rules.cleaning_fee;
  const securityDeposit = rules.security_deposit;
  const stayCharges = subtotal + cleaningFee;
  const tourismTax = tourismTaxFor(rules, nightly.length, opts.foreignGuest ?? false);
  const total = stayCharges + securityDeposit + tourismTax;

  let dueNow: number;
  if (rules.payment_policy === "full") {
    dueNow = total;
  } else {
    const pct = Math.min(100, Math.max(1, rules.deposit_percent));
    dueNow = Math.round((stayCharges * pct) / 100);
  }
  const balanceDue = total - dueNow;

  return {
    currency: rules.currency,
    nights: nightly.length,
    nightly,
    weekdayNights: nightly.length - weekendNights,
    weekendNights,
    subtotal,
    cleaningFee,
    securityDeposit,
    stayCharges,
    tourismTax,
    total,
    policy: rules.payment_policy,
    depositPercent: rules.payment_policy === "full" ? 100 : rules.deposit_percent,
    dueNow,
    balanceDue,
  };
}

/** Tourism tax owed for a stay (minor units). Only for foreign guests when the owner has turned it on. */
export function tourismTaxFor(rules: Pick<PricingRules, "tourism_tax_enabled" | "tourism_tax_rate" | "tourism_tax_rooms">, nights: number, foreignGuest: boolean): number {
  if (!foreignGuest || !rules.tourism_tax_enabled) return 0;
  const rate = Math.max(0, rules.tourism_tax_rate ?? 0);
  const rooms = Math.max(1, rules.tourism_tax_rooms ?? 1);
  return rate * rooms * nights;
}

export type StayError =
  | { code: "invalid_dates"; message: string }
  | { code: "past_date"; message: string }
  | { code: "too_far"; message: string }
  | { code: "min_nights"; message: string }
  | { code: "max_nights"; message: string }
  | { code: "unavailable"; message: string; dates: ISODate[] };

export const MAX_BOOKING_WINDOW_DAYS = 540;

/** Validate a requested stay against house rules and known unavailable nights. */
export function validateStay(
  rules: Pick<PricingRules, "min_nights" | "max_nights">,
  checkIn: ISODate,
  checkOut: ISODate,
  today: ISODate,
  unavailable: ReadonlySet<ISODate>,
): StayError | null {
  if (!isISODate(checkIn) || !isISODate(checkOut) || checkOut <= checkIn) {
    return { code: "invalid_dates", message: "Choose a check-out date after check-in." };
  }
  if (checkIn < today) return { code: "past_date", message: "Check-in can't be in the past." };
  if (diffDays(today, checkIn) > MAX_BOOKING_WINDOW_DAYS) {
    return { code: "too_far", message: "That date is beyond our booking window." };
  }
  const nights = diffDays(checkIn, checkOut);
  if (nights < rules.min_nights) {
    return { code: "min_nights", message: `Minimum stay is ${rules.min_nights} night${rules.min_nights > 1 ? "s" : ""}.` };
  }
  if (nights > rules.max_nights) {
    return { code: "max_nights", message: `Maximum stay is ${rules.max_nights} nights.` };
  }
  const clashes = eachNight(checkIn, checkOut).filter((n) => unavailable.has(n));
  if (clashes.length > 0) {
    return { code: "unavailable", message: "Some of those nights are no longer available.", dates: clashes };
  }
  return null;
}

export function validateGuests(rules: CapacityRules, guests: GuestCounts): string | null {
  const { adults, children, infants } = guests;
  if (![adults, children, infants].every((n) => Number.isInteger(n) && n >= 0)) return "Guest counts must be whole numbers.";
  if (adults < 1) return "At least one adult is required.";
  if (adults + children > rules.max_guests) return `This home sleeps up to ${rules.max_guests} guests (infants not counted).`;
  if (infants > rules.max_infants) return `Up to ${rules.max_infants} infants are allowed.`;
  return null;
}

/** Snapshot columns stored on a booking row. */
export interface BookingPriceSnapshot {
  currency: string;
  nightly_breakdown: unknown;
  subtotal: number;
  cleaning_fee: number;
  security_deposit: number;
  total_amount: number;
  payment_policy: PaymentPolicy;
  deposit_percent: number;
  amount_due_now: number;
  balance_due: number;
  tourism_tax?: number;
}

/** Rebuild a Quote from the price snapshot frozen on a booking (never re-priced). */
export function quoteFromSnapshot(b: BookingPriceSnapshot): Quote {
  const raw = Array.isArray(b.nightly_breakdown) ? b.nightly_breakdown : [];
  const nightly: NightlyRate[] = raw
    .filter((n): n is { date: string; rate: number; weekend?: boolean } => typeof n === "object" && n !== null && "date" in n && "rate" in n)
    .map((n) => ({ date: String(n.date), rate: Number(n.rate), weekend: Boolean(n.weekend) }));
  const weekendNights = nightly.filter((n) => n.weekend).length;
  return {
    currency: b.currency,
    nights: nightly.length,
    nightly,
    weekdayNights: nightly.length - weekendNights,
    weekendNights,
    subtotal: b.subtotal,
    cleaningFee: b.cleaning_fee,
    securityDeposit: b.security_deposit,
    stayCharges: b.subtotal + b.cleaning_fee,
    tourismTax: b.tourism_tax ?? 0,
    total: b.total_amount,
    policy: b.payment_policy,
    depositPercent: b.deposit_percent,
    dueNow: b.amount_due_now,
    balanceDue: b.balance_due,
  };
}

/** "3 guests, 1 infant" / "3 tetamu, 1 bayi" */
export function guestSummary(g: GuestCounts, locale: Locale = "en"): string {
  const seated = g.adults + g.children;
  const parts = [translatePlural(locale, "guests.summary", seated)];
  if (g.infants) parts.push(translatePlural(locale, "guests.infants", g.infants));
  return parts.join(", ");
}

/** Translation key + params for a stay validation error. */
export function stayErrorMessage(err: StayError, rules: Pick<PricingRules, "min_nights" | "max_nights">, locale: Locale): string {
  const key = `err.${err.code}` as MessageKey;
  const n = err.code === "min_nights" ? rules.min_nights : err.code === "max_nights" ? rules.max_nights : 0;
  return translate(locale, key, { n });
}

/** Localised guest validation error, or null when valid. */
export function guestErrorMessage(rules: CapacityRules, guests: GuestCounts, locale: Locale): string | null {
  const { adults, children, infants } = guests;
  if (![adults, children, infants].every((n) => Number.isInteger(n) && n >= 0)) return translate(locale, "err.guests.whole");
  if (adults < 1) return translate(locale, "err.guests.adult");
  if (adults + children > rules.max_guests) return translate(locale, "err.guests.capacity", { n: rules.max_guests });
  if (infants > rules.max_infants) return translate(locale, "err.guests.infants", { n: rules.max_infants });
  return null;
}

/** Currencies Stripe treats as zero-decimal (amount is in whole units). */
const ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);

export function minorUnitFactor(currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? 1 : 100;
}

/** Format minor units for display, e.g. (38000, "MYR") → "RM 380". */
export function formatMoney(minor: number, currency: string, opts: { cents?: boolean } = {}): string {
  const factor = minorUnitFactor(currency);
  const value = minor / factor;
  const showCents = opts.cents ?? value % 1 !== 0;
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: showCents && factor === 100 ? 2 : 0,
    maximumFractionDigits: factor === 100 ? 2 : 0,
  }).format(value);
}

/** Convert a decimal major-unit amount (e.g. from a form) to minor units. */
export function toMinor(major: number, currency: string): number {
  return Math.round(major * minorUnitFactor(currency));
}

export function toMajor(minor: number, currency: string): number {
  return minor / minorUnitFactor(currency);
}
