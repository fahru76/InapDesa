import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { finalizePaymentIntent } from "@/lib/booking-service";
import { serverEnv } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { elapsed, log } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint.
 * Subscribe to: payment_intent.succeeded, payment_intent.payment_failed,
 *               payment_intent.canceled, charge.refunded
 */
export async function POST(request: NextRequest) {
  const started = performance.now();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const rawBody = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, serverEnv.stripeWebhookSecret);
  } catch (err) {
    log.warn("stripe-webhook.bad-signature", { err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let outcome = "ignored";
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        outcome = await finalizePaymentIntent(event.data.object.id, event.id);
        break;
      }
      case "payment_intent.payment_failed": {
        await recordFailedPayment(event.data.object, event.id);
        outcome = "payment_failed_recorded";
        break;
      }
      case "payment_intent.canceled": {
        const db = createAdminClient();
        await db
          .from("bookings")
          .update({ status: "expired" })
          .eq("stripe_payment_intent_id", event.data.object.id)
          .eq("status", "pending_payment");
        outcome = "hold_released";
        break;
      }
      case "charge.refunded": {
        await recordRefunds(event.data.object);
        outcome = "refunds_recorded";
        break;
      }
      default:
        // Acknowledge events we don't handle so Stripe stops retrying them.
        break;
    }
  } catch (err) {
    log.error("stripe-webhook.handler-failed", { eventId: event.id, type: event.type, ms: elapsed(started), err });
    // 500 tells Stripe to retry with backoff; all handlers are idempotent.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  log.info("stripe-webhook.handled", { eventId: event.id, type: event.type, objectId: objectId(event), outcome, ms: elapsed(started) });
  return NextResponse.json({ received: true });
}

function objectId(event: Stripe.Event): string | undefined {
  const obj = event.data.object as { id?: unknown };
  return typeof obj.id === "string" ? obj.id : undefined;
}

async function recordFailedPayment(intent: Stripe.PaymentIntent, eventId: string) {
  const db = createAdminClient();
  const { data: booking } = await db
    .from("bookings")
    .select("id, property_id, currency")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();
  if (!booking) return;

  const { error } = await db.from("transactions").insert({
    booking_id: booking.id,
    property_id: booking.property_id,
    kind: "advance",
    status: "failed",
    provider: "stripe",
    amount: intent.amount,
    currency: booking.currency,
    provider_ref: `${intent.id}:${eventId}`,
    stripe_event_id: eventId,
    payment_method_type: intent.last_payment_error?.payment_method?.type ?? null,
  });
  // 23505 = unique violation → duplicate delivery, already recorded
  if (error && error.code !== "23505") throw new Error(error.message);
}

async function recordRefunds(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return;

  const db = createAdminClient();
  const { data: booking } = await db
    .from("bookings")
    .select("id")
    .or(`stripe_payment_intent_id.eq.${paymentIntentId},balance_payment_intent_id.eq.${paymentIntentId}`)
    .maybeSingle();
  if (!booking) return;

  const refunds = await getStripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  for (const refund of refunds.data) {
    if (refund.status !== "succeeded") continue;
    const { error } = await db.rpc("record_refund", {
      p_booking_id: booking.id,
      p_refund_id: refund.id,
      p_amount: refund.amount,
      p_currency: refund.currency,
    });
    if (error) throw new Error(error.message);
  }
}
