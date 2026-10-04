/**
 * Structured, PII-safe logging: one JSON line per event, so Vercel (or any log drain) can filter by
 * `level`, `event` and ids. Use for every request that moves money or talks to another system.
 *
 *   log.info("stripe-webhook.handled", { eventId, type, outcome, ms });
 *   log.error("booking.payment-setup-failed", { bookingId, provider, err });
 *
 * Never pass request bodies. Keys that look personal or secret are redacted, and emails / phone / card-like
 * numbers inside strings are masked, as a safety net — not as permission to log them.
 */

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const SENSITIVE_KEY = /(e-?mail|phone|name$|address|token|secret|password|authori[sz]ation|cookie|signature|card|ic_?number|passport)/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+\d[\d\s-]{7,}\d/g;
const LONG_NUMBER = /\b(?:\d[ -]?){11,18}\d\b/g;

const MAX_STRING = 500;
const MAX_ARRAY = 20;
const MAX_DEPTH = 3;

function maskText(s: string): string {
  const masked = s.replace(EMAIL, "[email]").replace(PHONE, "[phone]").replace(LONG_NUMBER, "[number]");
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…` : masked;
}

/** Converts any value into something safe and bounded for a log line. Exported for tests. */
export function serialize(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return maskText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;

  if (value instanceof Error) {
    const e = value as Error & { code?: unknown; statusCode?: unknown; type?: unknown };
    const out: Fields = { name: e.name, message: maskText(e.message) };
    if (typeof e.code === "string" || typeof e.code === "number") out.code = e.code;
    if (typeof e.statusCode === "number") out.statusCode = e.statusCode;
    if (typeof e.type === "string") out.type = e.type;
    if (process.env.NODE_ENV !== "production" && e.stack) out.stack = maskText(e.stack);
    return out;
  }
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if (seen.has(value)) return "[circular]";
    if (depth >= MAX_DEPTH) return Array.isArray(value) ? "[array]" : "[object]";
    seen.add(value);
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY).map((v) => serialize(v, depth + 1, seen));
      if (value.length > MAX_ARRAY) items.push(`…+${value.length - MAX_ARRAY} more`);
      return items;
    }
    const out: Fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      const s = serialize(v, depth + 1, seen);
      if (s !== undefined) out[k] = s;
    }
    return out;
  }
  return String(value);
}

function write(level: Level, event: string, fields?: Fields) {
  let line: string;
  try {
    const safe = (fields ? serialize(fields) : {}) as Fields;
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...safe });
  } catch {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, logError: "could not serialise fields" });
  }
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => write("info", event, fields),
  warn: (event: string, fields?: Fields) => write("warn", event, fields),
  error: (event: string, fields?: Fields) => write("error", event, fields),
};

/** Milliseconds since `start` (from `performance.now()`), rounded — for outcome logs. */
export function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}
