import "server-only";

import { addDays, todayInTimeZone, type ISODate } from "./dates";
import type { Tables } from "./database.types";
import { parseIcs, rangesToNights } from "./ical";
import { FeedFetchError, fetchCalendarText } from "./safe-fetch";
import { createAdminClient } from "./supabase/server";
import { log } from "@/lib/log";

export type CalendarFeed = Tables<"calendar_feeds">;
export interface SyncResult {
  feedId: string;
  ok: boolean;
  nights: number;
  error?: string;
}

const WINDOW_DAYS = 550;
const CHUNK = 500;

function chunks<T>(list: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Import one external calendar: block its nights, free nights it no longer lists.
 * Applied as a diff, so nights never flicker open while syncing. Nights the host already
 * closed (or another feed covers) are left as they are.
 */
export async function syncFeed(feed: Pick<CalendarFeed, "id" | "property_id" | "name" | "url">, timeZone: string): Promise<SyncResult> {
  const db = createAdminClient();
  const today = todayInTimeZone(timeZone);
  const from = addDays(today, -1);
  const to = addDays(today, WINDOW_DAYS);

  try {
    const text = await fetchCalendarText(feed.url);
    let nights: Set<ISODate>;
    try {
      nights = rangesToNights(parseIcs(text, timeZone), from, to);
    } catch {
      throw new FeedFetchError("That link didn't return a calendar file (.ics). Copy the export/iCal link, not the listing page.");
    }

    const { data: existingRows, error: readErr } = await db.from("blocked_dates").select("date").eq("feed_id", feed.id);
    if (readErr) throw new Error(readErr.message);
    const existing = new Set((existingRows ?? []).map((r) => r.date));

    const toDelete = [...existing].filter((d) => d < from || !nights.has(d));
    const toAdd = [...nights].filter((d) => !existing.has(d));

    for (const part of chunks(toDelete)) {
      const { error } = await db.from("blocked_dates").delete().eq("feed_id", feed.id).in("date", part);
      if (error) throw new Error(error.message);
    }
    for (const part of chunks(toAdd)) {
      const { error } = await db.from("blocked_dates").upsert(
        part.map((date) => ({ property_id: feed.property_id, date, feed_id: feed.id, reason: `Imported: ${feed.name}`.slice(0, 100) })),
        { onConflict: "property_id,date", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    }

    await db
      .from("calendar_feeds")
      .update({ last_synced_at: new Date().toISOString(), last_status: "ok", last_error: null, last_event_count: nights.size })
      .eq("id", feed.id);
    return { feedId: feed.id, ok: true, nights: nights.size };
  } catch (err) {
    const message = err instanceof FeedFetchError ? err.message : "Sync failed. Please try again later.";
    if (!(err instanceof FeedFetchError)) log.error("calendar-sync.feed-failed", { feedId: feed.id, err });
    await db
      .from("calendar_feeds")
      .update({ last_synced_at: new Date().toISOString(), last_status: "error", last_error: message.slice(0, 300) })
      .eq("id", feed.id);
    return { feedId: feed.id, ok: false, nights: 0, error: message };
  }
}

/** Sync a listing's feeds that are older than `maxAgeMinutes` (0 = all). Bounded by `timeoutMs` overall. */
export async function syncPropertyFeeds(propertyId: string, opts: { maxAgeMinutes?: number; timeoutMs?: number } = {}): Promise<SyncResult[]> {
  const db = createAdminClient();
  const [{ data: feeds }, { data: property }] = await Promise.all([
    db.from("calendar_feeds").select("*").eq("property_id", propertyId),
    db.from("properties").select("timezone").eq("id", propertyId).maybeSingle(),
  ]);
  if (!feeds?.length || !property) return [];
  const cutoff = Date.now() - (opts.maxAgeMinutes ?? 0) * 60_000;
  const stale = feeds.filter((f) => !f.last_synced_at || new Date(f.last_synced_at).getTime() < cutoff);
  if (stale.length === 0) return [];

  const work = Promise.all(stale.map((f) => syncFeed(f, property.timezone)));
  if (!opts.timeoutMs) return work;
  return Promise.race([work, new Promise<SyncResult[]>((resolve) => setTimeout(() => resolve([]), opts.timeoutMs))]);
}

/** Sync every feed (scheduled job). Runs a few at a time to stay polite to the platforms. */
export async function syncAllFeeds(): Promise<{ total: number; ok: number; failed: number }> {
  const db = createAdminClient();
  const { data: feeds } = await db.from("calendar_feeds").select("*, property:properties(timezone)");
  const list = (feeds ?? []) as (CalendarFeed & { property: { timezone: string } | null })[];
  let ok = 0;
  let failed = 0;
  for (const group of chunks(list, 4)) {
    const results = await Promise.all(group.map((f) => syncFeed(f, f.property?.timezone ?? "Asia/Kuala_Lumpur")));
    for (const r of results) {
      if (r.ok) ok++;
      else failed++;
    }
  }
  return { total: list.length, ok, failed };
}
