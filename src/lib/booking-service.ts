import "server-only";

import type Stripe from "stripe";
import { billPaymentUrl, billplzConfigured, createBill, deleteBill, getBill } from "@/lib/billplz";
import { syncPropertyFeeds } from "@/lib/calendar-sync";
import { localizeProperty, type Locale } from "@/lib/content";
import { todayInTimeZone } from "@/lib/dates";
import { sendBookingNotification } from "@/lib/notifications";
import type { Tables } from "@/lib/database.types";
import { publicEnv, serverEnv } from "@/lib/env";
import { quoteStay, validateGuests, validateStay, type Quote } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import type { CreateBookingInput } from "@/lib/validation";
import { log } from "@/lib/log";

export type Booking = Tables<"bookings">;
export type BookingWithProperty = Booking & { property: Tables<"properties"> };

export class BookingError extends Error {
  constructor(
    public readonly code: "not_found" | "invalid" | "unavailable" | "payment_setup_failed" | "method_unavailable",
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

interface PendingBase {
  bookingId: string;
  reference: string;
  accessToken: string;
  holdExpiresAt: string;
  quote: Quote;
}

export type PendingBookingResult =
  | (PendingBase & { provider: "stripe"; clientSecret: string })
  | (PendingBase & { provider: "billplz"; redirectUrl: string });

const EXCLUSION_VIOLATION = "23P01";

/** Whether a property can take Billplz payments right now (account configured + owner enabled + MYR). */
export function billplzAvailableFor(p: Pick<Tables<"properties">, "billplz_enabled" | "currency">): boolean {
  return p.billplz_enabled && p.currency === "MYR" && billplzConfigured();
}

/**
 * Create a date hold, then start payment for the amount due today with the chosen provider.
 * The price is always recomputed here from the database — the client quote is never trusted.
 */
export async function createPendingBooking(input: CreateBookingInput, locale: Locale = "en"): Promise<PendingBookingResult> {
  const db = createAdminClient();

  const { data: property, error: propErr } = await db
    .from("properties")
    .select("*")
    .eq("id", input.propertyId)
    .eq("is_published", true)
    .maybeSingle();
  if (propErr) throw new Error(propErr.message);
  if (!property) throw new BookingError("not_found", "This homestay is not available for booking.", 404);

  if (input.provider === "billplz" && !billplzAvailableFor(property)) {
    throw new BookingError("method_unavailable", "E-wallet payments aren't available for this homestay yet. Please pay by card.", 422);
  }

  const guestError = validateGuests(property, input);
  if (guestError) throw new BookingError("invalid", guestError, 422);

  // Pull fresh availability from Airbnb/Agoda/etc. if it's more than 15 minutes old (bounded wait).
  await syncPropertyFeeds(property.id, { maxAgeMinutes: 15, timeoutMs: 6000 }).catch((err) => log.warn("booking.feed-sync-skipped", { propertyId: property.id, err }));

  // Release lapsed holds, and any earlier unpaid attempt by the same guest for overlapping dates.
  await db.rpc("release_expired_holds", { p_property_id: property.id });
  await releaseGuestRetries(property.id, input.guest.email, input.checkIn, input.checkOut);

  const today = todayInTimeZone(property.timezone);
  const { data: unavailableRows, error: availErr } = await db.rpc("get_unavailable_dates", {
    p_property_id: property.id,
    p_from: input.checkIn,
    p_to: input.checkOut,
  });
  if (availErr) throw new Error(availErr.message);
  const unavailable = new Set((unavailableRows ?? []).map((r) => r.day));

  const stayError = validateStay(property, input.checkIn, input.checkOut, today, unavailable);
  if (stayError) {
    const isClash = stayError.code === "unavailable";
    throw new BookingError(isClash ? "unavailable" : "invalid", stayError.message, isClash ? 409 : 422);
  }

  const quote = quoteStay(property, input.checkIn, input.checkOut, { foreignGuest: input.foreignGuest });
  const policyText = localizeProperty(property, locale).cancellation_policy;
  const holdExpiresAt = new Date(Date.now() + serverEnv.bookingHoldMinutes * 60_000).toISOString();

  const { data: booking, error: insertErr } = await db
    .from("bookings")
    .insert({
      property_id: property.id,
      guest_name: input.guest.name,
      guest_email: input.guest.email.toLowerCase(),
      guest_phone: input.guest.phone,
      special_requests: input.guest.specialRequests || null,
      check_in: input.checkIn,
      check_out: input.checkOut,
      adults: input.adults,
      children: input.children,
      infants: input.infants,
      currency: quote.currency,
      nightly_breakdown: quote.nightly.map((n) => ({ date: n.date, rate: n.rate, weekend: n.weekend })),
      subtotal: quote.subtotal,
      cleaning_fee: quote.cleaningFee,
      security_deposit: quote.securityDeposit,
      total_amount: quote.total,
      payment_policy: quote.policy,
      deposit_percent: quote.depositPercent,
      amount_due_now: quote.dueNow,
      balance_due: quote.balanceDue,
      status: "pending_payment",
      hold_expires_at: holdExpiresAt,
      payment_provider: input.provider,
      tourism_tax: quote.tourismTax,
      foreign_guest: input.foreignGuest,
      cancellation_preset: property.cancellation_preset,
      cancellation_policy_text: policyText ? policyText.slice(0, 1000) : null,
      security_deposit_return_days: property.security_deposit_return_days,
      locale,
    })
    .select("id, reference, access_token")
    .single();

  if (insertErr) {
    if (insertErr.code === EXCLUSION_VIOLATION) {
      throw new BookingError("unavailable", "Someone just reserved some of these nights. Please pick other dates.", 409);
    }
    throw new Error(insertErr.message);
  }

  const base: PendingBase = { bookingId: booking.id, reference: booking.reference, accessToken: booking.access_token, holdExpiresAt, quote };
  const description = `${property.title} · ${input.checkIn} → ${input.checkOut} · ${booking.reference}`;

  try {
    if (input.provider === "billplz") {
      const site = publicEnv.siteUrl;
      const bill = await createBill({
        name: input.guest.name,
        email: input.guest.email,
        mobile: input.guest.phone,
        amount: quote.dueNow,
        description,
        callbackUrl: `${site}/api/billplz/callback`,
        redirectUrl: `${site}/api/billplz/return`,
        reference: booking.reference,
        gatewayCode: input.gatewayCode ?? null,
      });
      const { error: updErr } = await db.from("bookings").update({ billplz_bill_id: bill.id }).eq("id", booking.id);
      if (updErr) throw new Error(updErr.message);
      return { ...base, provider: "billplz", redirectUrl: billPaymentUrl(bill, !!input.gatewayCode) };
    }

    const stripe = getStripe();
    const intent = await stripe.paymentIntents.create(
      {
        amount: quote.dueNow,
        currency: quote.currency.toLowerCase(),
        automatic_payment_methods: { enabled: true },
        receipt_email: input.guest.email,
        description,
        metadata: {
          booking_id: booking.id,
          reference: booking.reference,
          property_id: property.id,
          kind: quote.balanceDue === 0 ? "full_payment" : "advance_deposit",
        },
      },
      { idempotencyKey: `booking-pi-${booking.id}` },
    );
    const { error: updErr } = await db.from("bookings").update({ stripe_payment_intent_id: intent.id }).eq("id", booking.id);
    if (updErr) throw new Error(updErr.message);
    if (!intent.client_secret) throw new Error("Stripe did not return a client secret");
    return { ...base, provider: "stripe", clientSecret: intent.client_secret };
  } catch (err) {
    // Free the dates immediately if payment setup failed.
    await db.from("bookings").update({ status: "expired" }).eq("id", booking.id);
    log.error("booking.payment-setup-failed", { bookingId: booking.id, provider: input.provider, err });
    throw new BookingError("payment_setup_failed", "We couldn't start the payment. Please try again.", 502);
  }
}

async function releaseGuestRetries(propertyId: string, email: string, checkIn: string, checkOut: string) {
  const db = createAdminClient();
  const { data: stale } = await db
    .from("bookings")
    .select("id, payment_provider, stripe_payment_intent_id, billplz_bill_id")
    .eq("property_id", propertyId)
    .eq("guest_email", email.toLowerCase())
    .eq("status", "pending_payment")
    .lt("check_in", checkOut)
    .gt("check_out", checkIn);
  if (!stale?.length) return;

  for (const b of stale) {
    try {
      if (b.stripe_payment_intent_id) {
        const stripe = getStripe();
        const pi = await stripe.paymentIntents.retrieve(b.stripe_payment_intent_id);
        if (pi.status === "succeeded" || pi.status === "processing") continue; // money is moving — keep it
        if (pi.status !== "canceled") await stripe.paymentIntents.cancel(pi.id);
      } else if (b.billplz_bill_id) {
        const bill = await getBill(b.billplz_bill_id);
        if (bill.paid) continue;
        if (bill.state === "due") await deleteBill(bill.id);
      }
    } catch (err) {
      log.warn("booking.stale-payment-cancel-failed", { bookingId: b.id, err });
      continue;
    }
    await db.from("bookings").update({ status: "expired" }).eq("id", b.id).eq("status", "pending_payment");
  }
}

export type FinalizeOutcome =
  | "confirmed"
  | "paid_in_full"
  | "already_processed"
  | "conflict"
  | "not_found"
  | "amount_mismatch"
  | "invalid_status"
  | "not_succeeded";

/** Email the guest after a first successful payment (no-op when email isn't configured). */
async function notifyConfirmed(bookingId: string | undefined, outcome: FinalizeOutcome) {
  if (!bookingId || (outcome !== "confirmed" && outcome !== "paid_in_full")) return;
  await sendBookingNotification(bookingId, "confirmation").catch((err) => log.error("booking.confirmation-email-failed", { bookingId, err }));
}

/** Describe how the guest paid: "card", "apple_pay", "google_pay", "fpx", "grabpay"… */
function paymentMethodLabel(pm: Stripe.PaymentIntent["payment_method"]): string {
  if (!pm || typeof pm === "string") return "unknown";
  if (pm.type === "card" && pm.card?.wallet?.type) return pm.card.wallet.type;
  return pm.type;
}

/**
 * Idempotently apply a succeeded PaymentIntent to its booking. Safe to call from the webhook
 * and from the confirmation page (covers delayed or missed webhooks).
 */
export async function finalizePaymentIntent(paymentIntentId: string, eventId: string | null): Promise<FinalizeOutcome> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["payment_method"] });
  if (intent.status !== "succeeded") return "not_succeeded";

  const db = createAdminClient();

  if (intent.metadata.kind === "balance") {
    const { data, error } = await db.rpc("finalize_balance_payment", {
      p_booking_id: intent.metadata.booking_id ?? "",
      p_provider: "stripe",
      p_provider_ref: intent.id,
      p_amount: intent.amount_received,
      p_currency: intent.currency,
      p_event_id: eventId ?? `sync-${intent.id}`,
      p_payment_method: paymentMethodLabel(intent.payment_method),
    });
    if (error) throw new Error(`finalize_balance_payment failed: ${error.message}`);
    const outcome = data as FinalizeOutcome;
    if (outcome === "amount_mismatch" || outcome === "invalid_status") log.error("booking.balance-needs-review", { paymentIntentId: intent.id, outcome });
    return outcome;
  }

  const { data, error } = await db.rpc("finalize_booking_payment", {
    p_payment_intent_id: intent.id,
    p_amount: intent.amount_received,
    p_currency: intent.currency,
    p_event_id: eventId ?? `sync-${intent.id}`,
    p_payment_method_type: paymentMethodLabel(intent.payment_method),
  });
  if (error) throw new Error(`finalize_booking_payment failed: ${error.message}`);
  const outcome = data as FinalizeOutcome;

  if (outcome === "conflict") {
    // Dates were lost after the hold lapsed: refund automatically.
    const refund = await stripe.refunds.create(
      { payment_intent: intent.id, reason: "requested_by_customer", metadata: { reason: "dates_unavailable_after_hold" } },
      { idempotencyKey: `conflict-refund-${intent.id}` },
    );
    const bookingId = intent.metadata.booking_id;
    if (bookingId) {
      await db.rpc("record_refund", {
        p_booking_id: bookingId,
        p_refund_id: refund.id,
        p_amount: refund.amount,
        p_currency: refund.currency,
      });
    }
  }

  if (outcome === "amount_mismatch") {
    log.error("booking.amount-mismatch", { paymentIntentId: intent.id, amountReceived: intent.amount_received });
  }
  await notifyConfirmed(intent.metadata.booking_id, outcome);
  return outcome;
}

/**
 * Idempotently apply a paid Billplz bill. The bill is always re-fetched from Billplz,
 * so the outcome never depends on data supplied by the browser or callback body.
 */
export async function finalizeBillplzBill(billId: string): Promise<FinalizeOutcome> {
  const bill = await getBill(billId);
  if (!bill.paid || bill.state !== "paid") return "not_succeeded";

  const db = createAdminClient();
  const method = bill.reference_1_label === "Bank Code" && bill.reference_1 ? bill.reference_1 : "billplz";
  const { data, error } = await db.rpc("finalize_billplz_bill", {
    p_bill_id: bill.id,
    p_amount: bill.paid_amount || bill.amount,
    p_payment_method: method,
  });
  if (error) throw new Error(`finalize_billplz_bill failed: ${error.message}`);
  const outcome = data as FinalizeOutcome;

  if (outcome === "not_found") {
    // Not an advance bill — maybe a balance bill.
    const { data: b } = await db.from("bookings").select("id").eq("balance_bill_id", bill.id).maybeSingle();
    if (b) {
      const { data: bal, error: balErr } = await db.rpc("finalize_balance_payment", {
        p_booking_id: b.id,
        p_provider: "billplz",
        p_provider_ref: bill.id,
        p_amount: bill.paid_amount || bill.amount,
        p_currency: "MYR",
        p_event_id: `billplz-${bill.id}`,
        p_payment_method: method,
      });
      if (balErr) throw new Error(`finalize_balance_payment failed: ${balErr.message}`);
      return bal as FinalizeOutcome;
    }
  }

  if (outcome === "conflict") {
    // Billplz has no refund API in its public reference — the host must refund manually.
    log.error("booking.billplz-paid-after-conflict", { billId: bill.id, action: "manual refund required" });
  }
  if (outcome === "amount_mismatch") {
    log.error("booking.amount-mismatch", { billId: bill.id, paidAmount: bill.paid_amount });
  }
  if (outcome === "confirmed" || outcome === "paid_in_full") {
    const { data: b } = await db.from("bookings").select("id").eq("billplz_bill_id", bill.id).maybeSingle();
    await notifyConfirmed(b?.id, outcome);
  }
  return outcome;
}

/** Guest-facing lookup (no login): requires the unguessable access token issued at checkout. */
export async function getGuestBooking(id: string, token: string): Promise<BookingWithProperty | null> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || !uuid.test(token)) return null;
  const db = createAdminClient();
  const { data, error } = await db
    .from("bookings")
    .select("*, property:properties(*)")
    .eq("id", id)
    .eq("access_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as BookingWithProperty | null) ?? null;
}

/** Guest-only sections (house guide…) for a property, read with the secret key. */
export async function getGuestOnlySections(propertyId: string): Promise<unknown> {
  const db = createAdminClient();
  const { data } = await db.from("property_guest_content").select("sections").eq("property_id", propertyId).maybeSingle();
  return data?.sections ?? [];
}

/** If the webhook / callback hasn't landed yet, ask the payment provider directly. */
export async function syncPendingBooking(booking: Booking): Promise<void> {
  if (booking.status === "confirmed" && booking.amount_paid < booking.total_amount) {
    // A balance payment may be in flight.
    try {
      if (booking.balance_payment_intent_id) await finalizePaymentIntent(booking.balance_payment_intent_id, null);
      else if (booking.balance_bill_id && billplzConfigured()) await finalizeBillplzBill(booking.balance_bill_id);
    } catch (err) {
      log.error("booking.balance-sync-failed", { bookingId: booking.id, err });
    }
    return;
  }
  if (booking.status !== "pending_payment" && booking.status !== "expired") return;
  try {
    if (booking.payment_provider === "billplz" && booking.billplz_bill_id) {
      if (billplzConfigured()) await finalizeBillplzBill(booking.billplz_bill_id);
    } else if (booking.stripe_payment_intent_id) {
      await finalizePaymentIntent(booking.stripe_payment_intent_id, null);
    }
  } catch (err) {
    log.error("booking.sync-failed", { bookingId: booking.id, err });
  }
}

// ─── Balance payment ───────────────────────────────────────────────────────

export type BalancePaymentResult = { provider: "stripe"; clientSecret: string; amount: number } | { provider: "billplz"; redirectUrl: string; amount: number };

/** Can the guest pay the remaining balance online right now? */
export function balancePayable(b: Pick<Booking, "status" | "amount_paid" | "total_amount" | "check_in">, timeZone: string): boolean {
  return b.status === "confirmed" && b.total_amount > b.amount_paid && b.check_in >= todayInTimeZone(timeZone);
}

/** Start an online payment for the outstanding balance (Stripe or Billplz). Reuses an open Stripe intent for the same amount. */
export async function startBalancePayment(b: BookingWithProperty, provider: "stripe" | "billplz", gatewayCode?: string | null): Promise<BalancePaymentResult> {
  if (!balancePayable(b, b.property.timezone)) throw new BookingError("invalid", "There's no balance to pay online for this booking.", 422);
  const amount = b.total_amount - b.amount_paid;
  const db = createAdminClient();
  const description = `${b.property.title} · balance · ${b.reference}`;

  if (provider === "billplz") {
    if (!billplzAvailableFor(b.property)) throw new BookingError("method_unavailable", "E-wallet payments aren't available for this homestay.", 422);
    const site = publicEnv.siteUrl;
    const bill = await createBill({
      name: b.guest_name,
      email: b.guest_email,
      mobile: b.guest_phone,
      amount,
      description,
      callbackUrl: `${site}/api/billplz/callback`,
      redirectUrl: `${site}/api/billplz/return`,
      reference: `${b.reference}-BAL`,
      gatewayCode: gatewayCode ?? null,
    });
    const { error } = await db.from("bookings").update({ balance_bill_id: bill.id }).eq("id", b.id);
    if (error) throw new Error(error.message);
    return { provider: "billplz", redirectUrl: billPaymentUrl(bill, !!gatewayCode), amount };
  }

  const stripe = getStripe();
  if (b.balance_payment_intent_id) {
    const existing = await stripe.paymentIntents.retrieve(b.balance_payment_intent_id);
    const reusable = ["requires_payment_method", "requires_confirmation", "requires_action"].includes(existing.status);
    if (reusable && existing.amount === amount && existing.client_secret) return { provider: "stripe", clientSecret: existing.client_secret, amount };
    if (existing.status === "processing" || existing.status === "succeeded") {
      throw new BookingError("invalid", "A balance payment is already being processed.", 409);
    }
    if (reusable) await stripe.paymentIntents.cancel(existing.id).catch(() => undefined);
  }
  const intent = await stripe.paymentIntents.create(
    {
      amount,
      currency: b.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: b.guest_email,
      description,
      metadata: { booking_id: b.id, reference: b.reference, property_id: b.property_id, kind: "balance" },
    },
    { idempotencyKey: `balance-pi-${b.id}-${amount}-${Math.floor(Date.now() / 600_000)}` },
  );
  const { error } = await db.from("bookings").update({ balance_payment_intent_id: intent.id }).eq("id", b.id);
  if (error) throw new Error(error.message);
  if (!intent.client_secret) throw new Error("Stripe did not return a client secret");
  return { provider: "stripe", clientSecret: intent.client_secret, amount };
}

// ─── Refunds ───────────────────────────────────────────────────────────────

/**
 * Refund up to `amount` across a booking's Stripe payments (balance first, then advance).
 * Returns the amount actually refunded. Billplz payments can't be refunded through the API.
 */
export async function refundStripePayments(b: Booking, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const stripe = getStripe();
  const db = createAdminClient();
  let remaining = amount;
  for (const piId of [b.balance_payment_intent_id, b.stripe_payment_intent_id]) {
    if (!piId || remaining <= 0) continue;
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    if (pi.status !== "succeeded") continue;
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const refundable = pi.amount_received - (charge?.amount_refunded ?? 0);
    const part = Math.min(remaining, refundable);
    if (part <= 0) continue;
    const refund = await stripe.refunds.create(
      { payment_intent: pi.id, amount: part, reason: "requested_by_customer", metadata: { booking_id: b.id, reference: b.reference } },
      { idempotencyKey: `refund-${b.id}-${pi.id}-${part}` },
    );
    await db.rpc("record_refund", { p_booking_id: b.id, p_refund_id: refund.id, p_amount: refund.amount, p_currency: refund.currency });
    remaining -= refund.amount;
  }
  return amount - remaining;
}
