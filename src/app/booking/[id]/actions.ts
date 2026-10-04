"use server";

import { revalidatePath } from "next/cache";
import { getGuestBooking } from "@/lib/booking-service";
import { canReview } from "@/lib/reviews";
import { createAdminClient } from "@/lib/supabase/server";
import { reviewSchema } from "@/lib/validation";
import { log } from "@/lib/log";

export interface ReviewResult {
  ok: boolean;
  message?: string;
}

/** Guest leaves one review for a completed stay. Authenticated by the booking's secret token. */
export async function submitReview(input: unknown): Promise<ReviewResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Please check your review." };
  const { bookingId, token, rating, body, displayName } = parsed.data;

  const booking = await getGuestBooking(bookingId, token);
  if (!booking) return { ok: false, message: "Booking not found." };
  if (!canReview(booking, booking.property.timezone)) return { ok: false, message: "You can review once your stay has ended." };

  const { error } = await createAdminClient()
    .from("reviews")
    .insert({
      booking_id: booking.id,
      property_id: booking.property_id,
      rating,
      body,
      guest_display_name: displayName,
      stay_month: `${booking.check_in.slice(0, 7)}-01`,
      locale: booking.locale,
    });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "You've already reviewed this stay." };
    log.error("review.insert-failed", { bookingId, err: error.message });
    return { ok: false, message: "Couldn't save your review. Please try again." };
  }
  revalidatePath(`/stays/${booking.property.slug}`);
  revalidatePath(`/booking/${booking.id}`);
  return { ok: true };
}
