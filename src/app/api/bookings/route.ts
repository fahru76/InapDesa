import { NextResponse, type NextRequest } from "next/server";
import { BookingError, createPendingBooking } from "@/lib/booking-service";
import { getLocale } from "@/lib/i18n-server";
import { createBookingSchema } from "@/lib/validation";
import { elapsed, log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/bookings — hold the dates and return a Stripe client secret for the deposit. */
export async function POST(request: NextRequest) {
  const started = performance.now();
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first ? `${first.path.join(".") || "request"}: ${first.message}` : "Invalid request.", issues: parsed.error.issues },
      { status: 422 },
    );
  }

  try {
    const result = await createPendingBooking(parsed.data, await getLocale());
    log.info("booking.held", {
      bookingId: result.bookingId,
      reference: result.reference,
      propertyId: parsed.data.propertyId,
      provider: parsed.data.provider,
      dueNow: result.quote.dueNow,
      ms: elapsed(started),
    });
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BookingError) {
      log.info("booking.rejected", { propertyId: parsed.data.propertyId, code: err.code, ms: elapsed(started) });
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    log.error("api-bookings.unexpected", { propertyId: parsed.data.propertyId, ms: elapsed(started), err });
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
