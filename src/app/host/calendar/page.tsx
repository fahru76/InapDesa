import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCalendarExportToken } from "@/app/host/actions";
import { AvailabilityManager } from "@/components/host/availability-manager";
import { CalendarSync, type FeedView } from "@/components/host/calendar-sync";
import { addDays, eachNight, formatDateShort, todayInTimeZone } from "@/lib/dates";
import { publicEnv } from "@/lib/env";
import { nightsToRanges } from "@/lib/ical";
import { getHostContext } from "@/lib/host";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendar" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HostCalendarPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { supabase, property } = await getHostContext(typeof sp.property === "string" ? sp.property : undefined);
  if (!property) redirect("/host/settings");

  const today = todayInTimeZone(property.timezone);
  const horizon = addDays(today, 550);
  const nowIso = new Date().toISOString();

  const [bookingsRes, blockedRes, feedsRes, exportToken] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, reference, guest_name, check_in, check_out, status, hold_expires_at")
      .eq("property_id", property.id)
      .in("status", ["pending_payment", "confirmed", "paid_in_full", "checked_in", "completed"])
      .gte("check_out", today)
      .lte("check_in", horizon),
    supabase.from("blocked_dates").select("date, reason, feed_id").eq("property_id", property.id).gte("date", today).lte("date", horizon),
    supabase.from("calendar_feeds").select("*").eq("property_id", property.id).order("created_at"),
    getCalendarExportToken(property.id),
  ]);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (blockedRes.error) throw new Error(blockedRes.error.message);

  const bookings = (bookingsRes.data ?? [])
    .filter((b) => b.status !== "pending_payment" || (b.hold_expires_at !== null && b.hold_expires_at > nowIso))
    .map((b) => ({ id: b.id, reference: b.reference, guest_name: b.guest_name, check_in: b.check_in, check_out: b.check_out, status: b.status }));

  // Imported nights that coincide with a paid InapDesa booking → possible double booking.
  const bookedNights = new Set(
    bookings.filter((b) => b.status !== "pending_payment").flatMap((b) => eachNight(b.check_in > today ? b.check_in : today, b.check_out)),
  );
  const feeds: FeedView[] = (feedsRes.data ?? []).map((f) => {
    const clash = (blockedRes.data ?? []).filter((d) => d.feed_id === f.id && bookedNights.has(d.date)).map((d) => d.date);
    let host = "";
    try {
      host = new URL(f.url).hostname;
    } catch {}
    return {
      id: f.id,
      name: f.name,
      host,
      lastSyncedAt: f.last_synced_at,
      lastStatus: f.last_status,
      lastError: f.last_error,
      nights: f.last_event_count,
      overlaps: nightsToRanges(clash).map((r) => (addDays(r.start, 1) === r.end ? formatDateShort(r.start) : `${formatDateShort(r.start)} – ${formatDateShort(addDays(r.end, -1))}`)),
    };
  });
  const exportUrl = exportToken ? `${publicEnv.siteUrl}/api/ical/${exportToken}.ics` : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-zinc-500">{property.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Availability</h1>
        <p className="mt-1 text-sm text-zinc-500">Close nights for owner stays, maintenance or off-platform bookings. Guests see changes instantly.</p>
      </header>
      <AvailabilityManager
        propertyId={property.id}
        today={today}
        bookings={bookings}
        blocked={(blockedRes.data ?? []).map((d) => ({ date: d.date, reason: d.reason }))}
        rates={{ weekday: property.weekday_rate, weekend: property.weekend_rate, weekendDays: property.weekend_days, currency: property.currency }}
      />
      <CalendarSync propertyId={property.id} exportUrl={exportUrl} feeds={feeds} />
    </div>
  );
}
