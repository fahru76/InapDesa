import "server-only";

import { todayInTimeZone } from "./dates";
import type { Tables } from "./database.types";
import { createAdminClient, createClient } from "./supabase/server";

export type PublicReview = Pick<
  Tables<"reviews">,
  "id" | "rating" | "body" | "guest_display_name" | "stay_month" | "locale" | "host_reply" | "host_replied_at" | "created_at"
>;
export const PUBLIC_REVIEW_COLUMNS = "id, rating, body, guest_display_name, stay_month, locale, host_reply, host_replied_at, created_at";

export interface ReviewSummary {
  count: number;
  average: number | null;
  items: PublicReview[];
}

/** Published reviews for a listing (public columns only), newest first. */
export async function getPropertyReviews(propertyId: string, limit = 6): Promise<ReviewSummary> {
  const supabase = await createClient();
  const [{ data: ratings }, { data: items }] = await Promise.all([
    supabase.from("reviews").select("rating").eq("property_id", propertyId),
    supabase.from("reviews").select(PUBLIC_REVIEW_COLUMNS).eq("property_id", propertyId).order("created_at", { ascending: false }).limit(limit),
  ]);
  const list = ratings ?? [];
  const average = list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : null;
  return { count: list.length, average, items: (items ?? []) as PublicReview[] };
}

/** The review left for a booking, if any (server-side, secret key). */
export async function getBookingReview(bookingId: string): Promise<PublicReview | null> {
  const { data } = await createAdminClient().from("reviews").select(PUBLIC_REVIEW_COLUMNS).eq("booking_id", bookingId).maybeSingle();
  return (data as PublicReview | null) ?? null;
}

/** A paid booking whose check-out day has arrived can be reviewed once. */
export function canReview(b: Pick<Tables<"bookings">, "status" | "check_out">, timeZone: string): boolean {
  if (!["confirmed", "paid_in_full", "checked_in", "completed"].includes(b.status)) return false;
  return b.check_out <= todayInTimeZone(timeZone);
}
