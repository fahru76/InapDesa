import { NextResponse, type NextRequest } from "next/server";
import { addDays, todayInTimeZone } from "@/lib/dates";
import { buildIcs, nightsToRanges, type ExportEvent } from "@/lib/ical";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/ical/:token(.ics) — availability feed for Airbnb, Agoda, Booking.com…
 * Contains InapDesa bookings and nights the host closed by hand. Imported nights are left out
 * (to avoid echo loops) and no guest details are included.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!UUID.test(token)) return new NextResponse("Not found", { status: 404 });

  const db = createAdminClient();
  const { data: priv } = await db.from("property_private").select("property_id").eq("ical_export_token", token).maybeSingle();
  if (!priv) return new NextResponse("Not found", { status: 404 });

  const { data: property } = await db.from("properties").select("id, title, timezone").eq("id", priv.property_id).maybeSingle();
  if (!property) return new NextResponse("Not found", { status: 404 });

  const since = addDays(todayInTimeZone(property.timezone), -30);
  const [{ data: bookings }, { data: blocked }] = await Promise.all([
    db
      .from("bookings")
      .select("id, check_in, check_out")
      .eq("property_id", property.id)
      .in("status", ["confirmed", "paid_in_full", "checked_in", "completed"])
      .gte("check_out", since),
    db.from("blocked_dates").select("date").eq("property_id", property.id).is("feed_id", null).gte("date", since),
  ]);

  const events: ExportEvent[] = [
    ...(bookings ?? []).map((b) => ({ uid: `${b.id}@inapdesa`, start: b.check_in, end: b.check_out, summary: "Reserved (InapDesa)" })),
    ...nightsToRanges((blocked ?? []).map((d) => d.date)).map((r) => ({ ...r, uid: `blocked-${property.id}-${r.start}@inapdesa`, summary: "Not available" })),
  ];

  return new NextResponse(buildIcs(`${property.title} · InapDesa`, events), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="inapdesa.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
