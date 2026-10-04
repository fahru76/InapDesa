import { NextResponse, type NextRequest } from "next/server";
import { BookingError, getGuestBooking, startBalancePayment } from "@/lib/booking-service";
import { balancePaymentSchema } from "@/lib/validation";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/bookings/:id/balance — start an online payment for the outstanding balance (guest, token-authenticated). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = balancePaymentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 422 });

  const booking = await getGuestBooking(id, parsed.data.token);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  try {
    const result = await startBalancePayment(booking, parsed.data.provider, parsed.data.gatewayCode);
    return NextResponse.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    log.error("api-balance.unexpected", { err });
    return NextResponse.json({ error: "We couldn't start the payment. Please try again." }, { status: 502 });
  }
}
