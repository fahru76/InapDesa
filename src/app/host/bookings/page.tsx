import { ExternalLink, QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CancelBookingButton, DepositReturnButton, MessageActions } from "@/components/host/booking-actions";
import { buttonStyles } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { isCancellationPreset, refundAt, splitPaid } from "@/lib/cancellation";
import { formatDateShort, todayInTimeZone } from "@/lib/dates";
import { getHostContext, messageContext, receiptUrl, withProperty, type HostBooking, type HostProperty } from "@/lib/host";
import { renderMessage, suggestedTemplate, TEMPLATE_LABELS, type MessageTemplate } from "@/lib/messaging";
import { formatMoney, guestSummary, toMajor } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bookings" };

const VIEWS = {
  upcoming: "Upcoming",
  pending: "Awaiting payment",
  past: "Past",
  cancelled: "Cancelled",
} as const;
type View = keyof typeof VIEWS;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function HostBookingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { supabase, property } = await getHostContext(typeof sp.property === "string" ? sp.property : undefined);
  if (!property) redirect("/host/settings");

  const view: View = typeof sp.view === "string" && sp.view in VIEWS ? (sp.view as View) : "upcoming";
  const today = todayInTimeZone(property.timezone);

  const base = supabase.from("bookings").select("*").eq("property_id", property.id);
  const query =
    view === "upcoming"
      ? base.in("status", ["confirmed", "paid_in_full", "checked_in"]).gte("check_out", today).order("check_in", { ascending: true })
      : view === "pending"
        ? base.eq("status", "pending_payment").order("created_at", { ascending: false })
        : view === "past"
          ? base.in("status", ["confirmed", "paid_in_full", "checked_in", "completed"]).lt("check_out", today).order("check_in", { ascending: false })
          : base.in("status", ["cancelled", "expired"]).order("created_at", { ascending: false });

  const { data, error } = await query.limit(100);
  if (error) throw new Error(error.message);
  const bookings = data ?? [];
  const { data: refundRows } = bookings.length
    ? await supabase.from("transactions").select("booking_id, amount").eq("kind", "refund").eq("status", "succeeded").in("booking_id", bookings.map((b) => b.id))
    : { data: [] };
  const refunded = new Map<string, number>();
  for (const r of refundRows ?? []) refunded.set(r.booking_id, (refunded.get(r.booking_id) ?? 0) + r.amount);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-zinc-500">{property.title}</p>
        <h1 className="text-3xl font-semibold tracking-tight">Bookings</h1>
      </header>

      <nav className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Filter bookings">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={withProperty(`/host/bookings?view=${v}`, property.id)}
            aria-current={v === view ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
              v === view
                ? "bg-ink text-white dark:bg-paper dark:text-ink"
                : "bg-paper text-zinc-600 ring-1 ring-zinc-200/80 hover:text-ink dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-800/80",
            )}
          >
            {VIEWS[v]}
          </Link>
        ))}
      </nav>

      {bookings.length === 0 ? (
        <div className="card px-6 py-16 text-center text-sm text-zinc-500">No {VIEWS[view].toLowerCase()} bookings.</div>
      ) : (
        <ul className="space-y-4">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} property={property} today={today} refunded={refunded.get(b.id) ?? 0} />
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingCard({ booking: b, property, today, refunded }: { booking: HostBooking; property: HostProperty; today: string; refunded: number }) {
  const ctx = messageContext(b, property);
  const messages = Object.fromEntries((Object.keys(TEMPLATE_LABELS) as MessageTemplate[]).map((t) => [t, renderMessage(t, ctx)])) as Record<MessageTemplate, string>;
  const outstanding = Math.max(0, b.total_amount - b.amount_paid);
  const canCheckIn = b.status === "confirmed" || b.status === "paid_in_full";
  const canCancel = ["pending_payment", "confirmed", "paid_in_full"].includes(b.status);
  const refundable = Math.max(0, b.amount_paid - refunded);
  const preset = isCancellationPreset(b.cancellation_preset) ? b.cancellation_preset : "custom";
  const due = refundable > 0 ? refundAt(preset, b.check_in, property.check_in_time, property.timezone, splitPaid(b)) : null;
  const balancePaidOnline = !!(b.balance_payment_intent_id || b.balance_bill_id) && b.amount_paid >= b.total_amount;
  const depositOpen =
    b.security_deposit > 0 && !b.deposit_returned_at && (b.status === "checked_in" || b.status === "completed" || (["confirmed", "paid_in_full"].includes(b.status) && b.check_out <= today));
  const depositPaidOnline = !!b.stripe_payment_intent_id && (b.payment_policy === "full" || !!b.balance_payment_intent_id);

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{b.guest_name}</h2>
            <StatusBadge status={b.status} />
            <span className="font-mono text-xs text-zinc-500">{b.reference}</span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {formatDateShort(b.check_in)} → {formatDateShort(b.check_out)} · {b.nights} night{b.nights > 1 ? "s" : ""} · {guestSummary(b)}
          </p>
          <p className="mt-1 text-sm break-all text-zinc-500">
            <a href={`tel:${b.guest_phone}`} className="hover:underline">
              {b.guest_phone}
            </a>{" "}
            ·{" "}
            <a href={`mailto:${b.guest_email}`} className="hover:underline">
              {b.guest_email}
            </a>
          </p>
          {b.special_requests && (
            <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">&ldquo;{b.special_requests}&rdquo;</p>
          )}
          {b.cancellation_reason && <p className="mt-2 text-sm text-red-600">Reason: {b.cancellation_reason}</p>}
          {b.tourism_tax > 0 && <p className="mt-2 text-xs text-zinc-500">Includes tourism tax {formatMoney(b.tourism_tax, b.currency)} (foreign guest)</p>}
          {b.deposit_returned_at && (
            <p className="mt-2 text-sm text-brand-700 dark:text-brand-300">
              Security deposit: {formatMoney(b.deposit_returned_amount ?? 0, b.currency)} of {formatMoney(b.security_deposit, b.currency)} returned on {formatDateShort(b.deposit_returned_at.slice(0, 10))}
              {b.deposit_return_note ? ` — ${b.deposit_return_note}` : ""}
            </p>
          )}
        </div>

        <dl className="grid shrink-0 grid-cols-3 gap-4 text-sm sm:grid-cols-1 sm:gap-1 sm:text-right">
          <div>
            <dt className="text-xs text-zinc-500">Total</dt>
            <dd className="font-semibold tabular-nums">{formatMoney(b.total_amount, b.currency)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Paid</dt>
            <dd className="font-semibold tabular-nums text-brand-700 dark:text-brand-400">{formatMoney(b.amount_paid, b.currency)}</dd>
            {b.amount_paid > 0 && <dd className="text-[11px] text-zinc-500">via {b.payment_provider === "billplz" ? "Billplz" : "Stripe"}{balancePaidOnline ? " · balance paid online" : ""}</dd>}
            {refunded > 0 && <dd className="text-[11px] text-zinc-500">{formatMoney(refunded, b.currency)} refunded</dd>}
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Outstanding</dt>
            <dd className={cn("font-semibold tabular-nums", outstanding > 0 && "text-terracotta-600")}>{formatMoney(outstanding, b.currency)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MessageActions phone={b.guest_phone} messages={messages} suggested={suggestedTemplate(b.status, b.check_in, today)} />
          <div className="flex flex-wrap gap-2">
            {canCheckIn && (
              <Link href={`/host/check-in/${b.reference}`} className={buttonStyles({ size: "sm" })}>
                <QrCode className="size-4" aria-hidden /> Check in
              </Link>
            )}
            <a href={receiptUrl(b)} target="_blank" rel="noopener noreferrer" className={buttonStyles({ size: "sm", variant: "outline" })}>
              Guest pass <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </div>
        {depositOpen && (
          <DepositReturnButton bookingId={b.id} depositMajor={toMajor(b.security_deposit, b.currency)} currencyLabel={b.currency} canRefundOnline={depositPaidOnline} />
        )}
        {canCancel && (
          <CancelBookingButton
            bookingId={b.id}
            reference={b.reference}
            refundable={refundable > 0 ? formatMoney(refundable, b.currency) : null}
            policyRefund={due ? formatMoney(Math.min(due.refund, refundable), b.currency) : null}
            provider={b.payment_provider === "billplz" ? "billplz" : "stripe"}
          />
        )}
      </div>
    </li>
  );
}
