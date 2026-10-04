import { addDays, eachNight, isISODate, type ISODate } from "./dates";

/**
 * Minimal iCalendar (RFC 5545) reader/writer for availability sync with Airbnb, Agoda, Booking.com
 * and similar. Only what availability needs: VEVENT start/end dates. No recurrence (platforms don't use it).
 */

export interface IcsRange {
  /** First night blocked. */
  start: ISODate;
  /** Exclusive end (the check-out day). */
  end: ISODate;
  uid?: string;
}

/** Undo RFC 5545 line folding (CRLF followed by a space or tab continues the previous line). */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function localDate(value: string, params: string, timeZone: string): ISODate | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  const date = `${y}-${mo}-${d}`;
  if (!isISODate(date)) return null;
  if (!hh || !z || /TZID=/i.test(params)) return date; // all-day, floating, or already local
  // UTC timestamp → the date it falls on at the property.
  const instant = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mi), Number(ss ?? 0)));
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Parse VEVENTs into blocked date ranges. Cancelled and transparent (free) events are ignored. */
export function parseIcs(text: string, timeZone: string, maxEvents = 5000): IcsRange[] {
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("Not an iCalendar file");
  const ranges: IcsRange[] = [];
  let ev: { start?: ISODate; end?: ISODate; uid?: string; skip?: boolean } | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      ev = {};
      continue;
    }
    if (/^END:VEVENT$/i.test(line)) {
      if (ev && !ev.skip && ev.start) {
        let end = ev.end && ev.end > ev.start ? ev.end : addDays(ev.start, 1);
        if (end <= ev.start) end = addDays(ev.start, 1);
        ranges.push({ start: ev.start, end, uid: ev.uid });
        if (ranges.length >= maxEvents) break;
      }
      ev = null;
      continue;
    }
    if (!ev) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name = "", ...rest] = head.split(";");
    const params = rest.join(";");
    switch (name.toUpperCase()) {
      case "DTSTART":
        ev.start = localDate(value, params, timeZone) ?? undefined;
        break;
      case "DTEND":
        ev.end = localDate(value, params, timeZone) ?? undefined;
        break;
      case "UID":
        ev.uid = value.trim().slice(0, 200);
        break;
      case "STATUS":
        if (/CANCELLED/i.test(value)) ev.skip = true;
        break;
      case "TRANSP":
        if (/TRANSPARENT/i.test(value)) ev.skip = true;
        break;
    }
  }
  return ranges;
}

/** Nights covered by the ranges, clipped to [from, to). */
export function rangesToNights(ranges: IcsRange[], from: ISODate, to: ISODate): Set<ISODate> {
  const nights = new Set<ISODate>();
  for (const r of ranges) {
    const start = r.start < from ? from : r.start;
    const end = r.end > to ? to : r.end;
    if (end <= start) continue;
    for (const n of eachNight(start, end)) nights.add(n);
  }
  return nights;
}

/** Group sorted dates into consecutive [start, end) ranges. */
export function nightsToRanges(dates: Iterable<ISODate>): IcsRange[] {
  const sorted = [...new Set(dates)].sort();
  const out: IcsRange[] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && last.end === d) last.end = addDays(d, 1);
    else out.push({ start: d, end: addDays(d, 1) });
  }
  return out;
}

function escapeText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (out.length === 0 ? 75 : 74)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const compact = (d: ISODate) => d.replace(/-/g, "");

export interface ExportEvent extends IcsRange {
  uid: string;
  summary: string;
}

export function buildIcs(calendarName: string, events: ExportEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//InapDesa//Availability//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(e.end)}`,
      `SUMMARY:${escapeText(e.summary)}`,
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
