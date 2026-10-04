import { NextResponse, type NextRequest } from "next/server";
import { billplzConfigured, verifyXSignature } from "@/lib/billplz";
import { finalizeBillplzBill } from "@/lib/booking-service";
import { elapsed, log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Billplz server-to-server callback (POST, application/x-www-form-urlencoded).
 * The X Signature is verified, then the bill is re-fetched from Billplz before anything is recorded.
 */
export async function POST(request: NextRequest) {
  const started = performance.now();
  if (!billplzConfigured()) return NextResponse.json({ error: "Billplz not configured" }, { status: 503 });

  let params: Record<string, string>;
  try {
    const form = await request.formData();
    params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!verifyXSignature(params, params.x_signature)) {
    log.warn("billplz-callback.bad-signature", { billId: params.id });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const billId = params.id;
  if (!billId) return NextResponse.json({ error: "Missing bill id" }, { status: 400 });

  try {
    const outcome = await finalizeBillplzBill(billId);
    log.info("billplz-callback.handled", { billId, outcome, ms: elapsed(started) });
  } catch (err) {
    log.error("billplz-callback.finalize-failed", { billId, ms: elapsed(started), err });
    // Non-2xx makes Billplz retry the callback; finalisation is idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}
