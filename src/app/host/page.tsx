import { ArrowRight, CalendarCheck, Hourglass, Landmark, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import { MessageActions, ReviewReply } from "@/components/host/booking-actions";
import { Stars } from "@/components/property/reviews";
import { PUBLIC_REVIEW_COLUMNS, type PublicReview } from "@/lib/reviews";
import { buttonStyles } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { addDays, diffDays, eachNight, formatDateShort, formatRange, todayInTimeZone } from "@/lib/dates";
import { getHostContext, messageContext, withProperty, type HostBooking, type HostProperty } from "@/lib/host";
import { renderMessage, suggestedTemplate, TEMPLATE_LABELS, type MessageTemplate } from "@/lib/messaging";
import { formatMoney } from "@/lib/pricing";
import { getStripe } from "@/lib/stripe";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const ACTIVE = ["confirmed", "paid_in_full", "checked_in", "completed"] as const;

export default async function HostOverviewPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { supabase, property } = await getHostContext(typeof sp.property === "string" ? sp.property : undefined);

  if (!property) {
    return (
      <div className="card mx-auto max-w-xl p-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome, host</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Create your first listing to start taking direct bookings with advance deposits.</p>
        <Link href="/host/settings" className={buttonStyles({ className: "mt-6" })}>
          Create your listing <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const today = todayInTimeZone(property.timezone);
  const windowEnd = addDays(today, 30);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [bookingsRes, txRes, blockedRes] = await Promise.all([
    supabase
      .from("bookings")
      .select("*")
      .eq("property_id", property.id)
      .in("status", [...ACTIVE, "pending_payment"])
      .gte("check_out", today)
      .order("check_in", { ascending: true })
      .limit(200),
    supabase.from("transactions").select("*").eq("property_id", property.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("blocked_dates").select("date").eq("property_id", property.id).gte("date", today).lt("date", windowEnd),
  ]);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);

  const bookings = bookingsRes.data ?? [];
  const transactions = txRes.data ?? [];
  const confirmed = bookings.filter((b) => (ACTIVE as readonly string[]).includes(b.status));

  const monthTx = transactions.filter((t) => t.created_at.slice(0, 10) >= monthStart && t.status === "succeeded");
  const advanceThisMonth =
    monthTx.filter((t) => t.kind === "advance").reduce((s, t) => s + t.amount, 0) - monthTx.filter((t) => t.kind === "refund").reduce((s, t) => s + t.amount, 0);
  const balanceToCollect = confirmed.filter((b) => b.status !== "checked_in").reduce((s, b) => s + Math.max(0, b.total_amount - b.amount_paid), 0);
  const upcoming = confirmed.filter((b) => b.check_in >= today && b.check_in < windowEnd);

  const windowNights = new Set(eachNight(today, windowEnd));
  const blockedCount = (blockedRes.data ?? []).length;
  const bookedNights = new Set(confirmed.flatMap((b) => eachNight(b.check_in, b.check_out)).filter((n) => windowNights.has(n)));
  const sellable = Math.max(1, windowNights.size - blockedCount);
  const occupancy = Math.round((bookedNights.size / sellable) * 100);

  const arrivals = confirmed.filter((b) => b.status !== "checked_in" && b.check_in >= today).slice(0, 5);
  const inHouse = confirmed.filter((b) => b.status === "checked_in" || (b.check_in <= today && b.check_out > today));
  const payouts = await loadStripePayouts(property.currency);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-zinc-500">{property.title}</p>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        </div>
        <Link href={`/stays/${property.slug}`} className={buttonStyles({ variant: "outline", size: "sm" })} target="_blank">
          View listing
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Key metrics">
        <Stat icon={Wallet} label="Advance payments this month" value={formatMoney(advanceThisMonth, property.currency)} hint="Net of refunds, via Stripe" accent />
        <Stat
          icon={Hourglass}
          label="Balance to collect on arrival"
          value={formatMoney(balanceToCollect, property.currency)}
          hint={`${confirmed.length} active booking${confirmed.length === 1 ? "" : "s"}`}
        />
        <Stat icon={CalendarCheck} label="Arrivals next 30 days" value={String(upcoming.length)} hint={upcoming[0] ? `Next: ${formatDateShort(upcoming[0].check_in)}` : "No arrivals yet"} />
        <Stat icon={TrendingUp} label="Occupancy next 30 days" value={`${occupancy}%`} hint={`${bookedNights.size} of ${sellable} open nights`} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold tracking-tight">Arriving soon</h2>
            <Link href={withProperty("/host/bookings", property.id)} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-400">
              All bookings
            </Link>
          </div>
          {inHouse.length > 0 && (
            <p className="mb-4 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-500/10 dark:text-sky-300">
              In house now: {inHouse.map((b) => b.guest_name).join(", ")}
            </p>
          )}
          {arrivals.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No upcoming arrivals. Share your listing link to start taking bookings.</p>
          ) : (
            <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
              {arrivals.map((b) => (
                <ArrivalRow key={b.id} booking={b} property={property} today={today} />
              ))}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold tracking-tight">
              <Landmark className="size-4 text-brand-600" aria-hidden /> Incoming payouts
            </h2>
            {payouts.ok ? (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-500/10">
                    <dt className="text-xs font-medium text-brand-700 dark:text-brand-300">Pending</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">{formatMoney(payouts.pending, property.currency)}</dd>
                  </div>
                  <div className="rounded-xl bg-zinc-100 p-3 dark:bg-zinc-800/60">
                    <dt className="text-xs font-medium text-zinc-500">Available</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums">{formatMoney(payouts.available, property.currency)}</dd>
                  </div>
                </dl>
                <ul className="mt-4 space-y-2 text-sm">
                  {payouts.list.length === 0 && <li className="text-zinc-500">No payouts yet.</li>}
                  {payouts.list.map((p) => (
                    <li key={p.id} className="flex items-center justify-between">
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {p.arrival} · <span className="capitalize">{p.status.replace("_", " ")}</span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">{payouts.message}</p>
            )}
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="font-semibold tracking-tight">Recent payments</h2>
            {transactions.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Payments will appear here as guests book.</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm">
                {transactions.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {t.kind === "advance" ? "Advance" : t.kind === "balance" ? (t.provider === "on_site" ? "Balance (on site)" : "Balance (online)") : "Refund"}
                        {t.status !== "succeeded" && <span className="ml-1.5 text-xs font-semibold text-red-600">· {t.status}</span>}
                      </p>
                      <p className="truncate text-xs text-zinc-500">
                        {new Date(t.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "short" })} · {(t.payment_method_type ?? t.provider).replace("_", " ")}
                      </p>
                    </div>
                    <span className={`shrink-0 font-semibold tabular-nums ${t.kind === "refund" ? "text-red-600" : ""}`}>
                      {t.kind === "refund" ? "−" : ""}
                      {formatMoney(t.amount, t.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <ReviewsCard propertyId={property.id} />
        </div>
      </div>
    </div>
  );
}

async function ReviewsCard({ propertyId }: { propertyId: string }) {
  const { supabase } = await getHostContext(propertyId);
  const { data } = await supabase.from("reviews").select(PUBLIC_REVIEW_COLUMNS).eq("property_id", propertyId).order("created_at", { ascending: false }).limit(5);
  const reviews = (data ?? []) as PublicReview[];
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-semibold tracking-tight">Guest reviews</h2>
      {reviews.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">Guests are invited to review after check-out. Reviews appear here and on your listing.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="space-y-1.5 border-b border-zinc-200/80 pb-4 last:border-0 last:pb-0 dark:border-zinc-800/80">
              <div className="flex items-center justify-between gap-2">
                <Stars value={r.rating} label={`${r.rating} out of 5 stars`} />
                <span className="text-xs text-zinc-500">{r.guest_display_name}</span>
              </div>
              <p className="line-clamp-3 text-sm text-zinc-700 dark:text-zinc-300">{r.body}</p>
              {r.host_reply && <p className="rounded-lg bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">You: {r.host_reply}</p>}
              <ReviewReply reviewId={r.id} initial={r.host_reply} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ArrivalRow({ booking: b, property, today }: { booking: HostBooking; property: HostProperty; today: string }) {
  const ctx = messageContext(b, property);
  const messages = Object.fromEntries((Object.keys(TEMPLATE_LABELS) as MessageTemplate[]).map((t) => [t, renderMessage(t, ctx)])) as Record<MessageTemplate, string>;
  const days = diffDays(today, b.check_in);
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{b.guest_name}</p>
          <StatusBadge status={b.status} />
        </div>
        <p className="mt-0.5 text-sm text-zinc-500">
          {formatRange(b.check_in, b.check_out)} · {b.adults + b.children} guests · {days === 0 ? "arrives today" : days === 1 ? "tomorrow" : `in ${days} days`}
        </p>
        {b.total_amount - b.amount_paid > 0 && (
          <p className="mt-0.5 text-sm font-medium text-terracotta-600">Collect {formatMoney(b.total_amount - b.amount_paid, b.currency)} on arrival</p>
        )}
      </div>
      <MessageActions phone={b.guest_phone} messages={messages} suggested={suggestedTemplate(b.status, b.check_in, today)} />
    </li>
  );
}

function Stat({ icon: Icon, label, value, hint, accent }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className={accent ? "relative overflow-hidden rounded-2xl bg-ink p-5 text-white shadow-float dark:bg-zinc-900" : "card p-5"}>
      {accent && <div className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-brand-500/30 blur-3xl" />}
      <Icon className={accent ? "size-5 text-brand-300" : "size-5 text-zinc-400"} />
      <p className={`mt-4 text-sm ${accent ? "text-white/70" : "text-zinc-500"}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className={`mt-1 text-xs ${accent ? "text-white/60" : "text-zinc-500"}`}>{hint}</p>
    </div>
  );
}

type PayoutSummary =
  | { ok: true; pending: number; available: number; list: { id: string; amount: number; currency: string; arrival: string; status: string }[] }
  | { ok: false; message: string };

async function loadStripePayouts(currency: string): Promise<PayoutSummary> {
  try {
    const stripe = getStripe();
    const [balance, payouts] = await Promise.all([stripe.balance.retrieve(), stripe.payouts.list({ limit: 4 })]);
    const cur = currency.toLowerCase();
    const sum = (rows: { amount: number; currency: string }[]) => rows.filter((r) => r.currency === cur).reduce((s, r) => s + r.amount, 0);
    return {
      ok: true,
      pending: sum(balance.pending),
      available: sum(balance.available),
      list: payouts.data.map((p) => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency.toUpperCase(),
        arrival: new Date(p.arrival_date * 1000).toLocaleDateString("en-MY", { day: "numeric", month: "short" }),
        status: p.status,
      })),
    };
  } catch (err) {
    log.error("host.stripe-payouts-unavailable", { err });
    return { ok: false, message: "Add your Stripe secret key to see pending and upcoming payouts." };
  }
}
