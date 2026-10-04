import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncAllFeeds } from "@/lib/calendar-sync";
import { addDays, diffDays, todayInTimeZone } from "@/lib/dates";
import type { NotificationKind } from "@/lib/database.types";
import { emailConfigured } from "@/lib/email";
import { serverEnv } from "@/lib/env";
import { elapsed, log } from "@/lib/log";
import { sendBookingNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = serverEnv.cronSecret;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Daily job (Vercel Cron, 09:00 Malaysia time — see vercel.json):
 *  1. release expired payment holds
 *  2. re-sync every external calendar
 *  3. send arrival reminders (≈7 days and 1 day before) and review invites (after check-out)
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    log.warn("cron.unauthorised");
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const started = performance.now();
  try {
    const summary = await runDaily();
    log.info("cron.done", { ...summary, ms: elapsed(started) });
    return NextResponse.json(summary);
  } catch (err) {
    log.error("cron.failed", { ms: elapsed(started), err });
    return NextResponse.json({ error: "Daily job failed" }, { status: 500 });
  }
}

async function runDaily() {
  const db = createAdminClient();

  const released = await db.rpc("release_expired_holds", {});
  const sync = await syncAllFeeds();

  const sent: Record<NotificationKind, number> = { confirmation: 0, arrival_7d: 0, arrival_1d: 0, review_invite: 0 };
  let skipped = "";
  if (!emailConfigured()) {
    skipped = "email not configured";
  } else {
    const utcToday = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await db
      .from("bookings")
      .select("id, status, check_in, check_out, property:properties(timezone)")
      .in("status", ["confirmed", "paid_in_full", "checked_in", "completed"])
      .lte("check_in", addDays(utcToday, 8))
      .gte("check_out", addDays(utcToday, -15));
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as unknown as { id: string; status: string; check_in: string; check_out: string; property: { timezone: string } | null }[];

    const { data: reviewed } = await db.from("reviews").select("booking_id").in("booking_id", list.map((b) => b.id).concat("00000000-0000-0000-0000-000000000000"));
    const hasReview = new Set((reviewed ?? []).map((r) => r.booking_id));

    for (const b of list) {
      const today = todayInTimeZone(b.property?.timezone ?? "Asia/Kuala_Lumpur");
      const daysToArrival = diffDays(today, b.check_in);
      const upcoming = b.status === "confirmed" || b.status === "paid_in_full";
      let kind: NotificationKind | null = null;
      if (upcoming && daysToArrival >= 2 && daysToArrival <= 7) kind = "arrival_7d";
      else if (upcoming && daysToArrival >= 0 && daysToArrival <= 1) kind = "arrival_1d";
      else if (b.check_out <= today && diffDays(b.check_out, today) <= 14 && !hasReview.has(b.id)) kind = "review_invite";
      if (!kind) continue;
      const outcome = await sendBookingNotification(b.id, kind);
      if (outcome === "sent") sent[kind]++;
    }
  }

  if (released.error) log.error("cron.release-holds-failed", { err: released.error.message });
  return { releasedHolds: released.data ?? 0, calendars: sync, emails: sent, ...(skipped ? { skipped } : {}) };
}
