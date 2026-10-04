import { NextResponse, type NextRequest } from "next/server";
import { billplzConfigured } from "@/lib/billplz";
import { finalizeBillplzBill } from "@/lib/booking-service";
import { createAdminClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Where Billplz sends the guest after paying (GET ?billplz[id]=…&billplz[paid]=…&billplz[x_signature]=…).
 * We don't trust the query string for the outcome: the bill is re-fetched from Billplz, then the
 * guest is forwarded to their booking pass.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const billId = url.searchParams.get("billplz[id]");
  if (!billId || !/^[\w-]{4,40}$/.test(billId)) return NextResponse.redirect(new URL("/", url.origin));

  const db = createAdminClient();
  const { data: booking } = await db
    .from("bookings")
    .select("id, access_token, status, balance_bill_id")
    .or(`billplz_bill_id.eq.${billId},balance_bill_id.eq.${billId}`)
    .maybeSingle();
  const isBalance = booking?.balance_bill_id === billId;
  if (!booking) return NextResponse.redirect(new URL("/", url.origin));

  let paid = false;
  if (billplzConfigured()) {
    try {
      const outcome = await finalizeBillplzBill(billId);
      paid = outcome !== "not_succeeded" && outcome !== "not_found";
    } catch (err) {
      log.error("billplz-return.finalize-failed", { billId, err });
    }
  }

  const dest = new URL(`/booking/${booking.id}`, url.origin);
  dest.searchParams.set("token", booking.access_token);
  if (!paid && url.searchParams.get("billplz[paid]") === "false") dest.searchParams.set(isBalance ? "balance_status" : "redirect_status", "failed");
  return NextResponse.redirect(dest, { status: 303 });
}
