/**
 * Small fixed-window rate limiter for public mutation endpoints.
 *
 * Why in-memory: every POST /api/bookings creates a hold that blocks real dates for BOOKING_HOLD_MINUTES, so a
 * script hammering checkout can take a listing off the market. This cap stops the cheap case (one client looping)
 * with no new paid service or DB migration. Limitation: counts are per server instance, so on Vercel a determined
 * attacker spread across instances gets more attempts. If abuse shows up in the `booking.rate-limited` logs, move the
 * counter to Postgres or a managed store.
 */

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Entry = { count: number; resetAt: number };

export function createRateLimiter({ limit, windowMs, maxKeys = 10_000 }: { limit: number; windowMs: number; maxKeys?: number }) {
  const entries = new Map<string, Entry>();

  function evict(now: number) {
    for (const [key, e] of entries) if (e.resetAt <= now) entries.delete(key);
    // Still full of live keys: drop the oldest (Map keeps insertion order) so memory stays bounded.
    while (entries.size >= maxKeys) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  }

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      const current = entries.get(key);
      if (!current || current.resetAt <= now) {
        if (current) entries.delete(key);
        if (entries.size >= maxKeys) evict(now);
        entries.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
      }
      if (current.count < limit) {
        current.count += 1;
        return { allowed: true };
      }
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
    },
    size: () => entries.size,
  };
}

/** Best-effort client IP. Vercel sets x-forwarded-for with the real client first. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
