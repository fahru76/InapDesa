/**
 * Calendar-date helpers. Stays are expressed as ISO "YYYY-MM-DD" strings (property-local
 * calendar dates). All arithmetic is done at UTC midnight so DST and the viewer's time zone
 * never shift a date.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

export function parseISODate(value: ISODate): Date {
  if (!isISODate(value)) throw new Error(`Invalid ISO date: ${value}`);
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: ISODate, days: number): ISODate {
  const d = parseISODate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function addMonths(value: ISODate, months: number): ISODate {
  const d = parseISODate(value);
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

/** Whole days from a to b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000);
}

/** Each night of a stay: [checkIn, checkOut). */
export function eachNight(checkIn: ISODate, checkOut: ISODate): ISODate[] {
  const n = diffDays(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(value: ISODate): number {
  const dow = parseISODate(value).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function startOfMonth(value: ISODate): ISODate {
  return `${value.slice(0, 7)}-01`;
}

/** Today's calendar date in an IANA time zone (e.g. "Asia/Kuala_Lumpur"). */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Calendar grid for a month (Monday-first), padded with nulls. */
export function monthGrid(monthStart: ISODate): (ISODate | null)[] {
  const first = parseISODate(startOfMonth(monthStart));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = isoDayOfWeek(toISODate(first)) - 1;
  const cells: (ISODate | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push(toISODate(new Date(Date.UTC(year, month, day))));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** UI locale ("en" | "ms"); kept as a string here so this module has no dependencies. */
type UiLocale = "en" | "ms";
const tag = (l: UiLocale) => (l === "ms" ? "ms-MY" : "en-MY");

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: UiLocale, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${locale}:${key}`;
  let f = fmtCache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(tag(locale), { ...opts, timeZone: "UTC" });
    fmtCache.set(k, f);
  }
  return f;
}

export const formatDateLong = (v: ISODate, locale: UiLocale = "en") =>
  fmt(locale, "long", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(parseISODate(v));
export const formatDateShort = (v: ISODate, locale: UiLocale = "en") => fmt(locale, "short", { day: "numeric", month: "short" }).format(parseISODate(v));
export const formatMonth = (v: ISODate, locale: UiLocale = "en") => fmt(locale, "month", { month: "long", year: "numeric" }).format(parseISODate(v));

export function formatRange(checkIn: ISODate, checkOut: ISODate, locale: UiLocale = "en"): string {
  return `${formatDateShort(checkIn, locale)} – ${formatDateShort(checkOut, locale)}`;
}

/** "15:00:00" → "3:00 PM" (en) / "3:00 PTG" (ms) */
export function formatTime(value: string, locale: UiLocale = "en"): string {
  const [h = "0", m = "0"] = value.split(":");
  const d = new Date(Date.UTC(2000, 0, 1, Number(h), Number(m)));
  return fmt(locale, "time", { hour: "numeric", minute: "2-digit" }).format(d);
}
