import { CalendarDays, CircleAlert, CircleCheck, Clock, Hourglass, MapPin, MessageCircle, Users, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancellationSchedule, DepositNote } from "@/components/booking/policy-details";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { ReviewList } from "@/components/property/reviews";
import { BalancePay } from "@/components/receipt/balance-pay";
import { ReviewForm } from "@/components/receipt/review-form";
import { PaymentStatusPoller, QrPass, ReceiptActions } from "@/components/receipt/receipt-client";
import { buttonStyles } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { ContentSections } from "@/components/property/content-sections";
import { balancePayable, billplzAvailableFor, getGuestBooking, getGuestOnlySections, syncPendingBooking, type BookingWithProperty } from "@/lib/booking-service";
import { isCancellationPreset, splitPaid } from "@/lib/cancellation";
import { canReview, getBookingReview, type PublicReview } from "@/lib/reviews";
import { AwanDivider, RebungBand } from "@/components/ui/ornament";
import { localizeProperty, parseSections } from "@/lib/content";
import { ListingTheme } from "@/components/site/listing-theme";
import { formatDateLong, formatTime } from "@/lib/dates";
import { publicEnv } from "@/lib/env";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/i18n-server";
import { whatsappLink } from "@/lib/messaging";
import { formatMoney, guestSummary, quoteFromSnapshot } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("rc.metaTitle"), robots: { index: false, follow: false } };
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const PAID = new Set(["confirmed", "paid_in_full", "checked_in", "completed"]);

export default async function BookingReceiptPage({ params, searchParams }: Props) {
  const [{ id }, sp, t] = await Promise.all([params, searchParams, getT()]);
  const token = one(sp.token);
  let booking = await getGuestBooking(id, token);
  if (!booking) notFound();

  // The webhook may not have arrived yet — reconcile directly with Stripe.
  const balanceInFlight = booking.status === "confirmed" && !!(booking.balance_payment_intent_id || booking.balance_bill_id);
  if (booking.status === "pending_payment" || booking.status === "expired" || balanceInFlight) {
    await syncPendingBooking(booking);
    booking = (await getGuestBooking(id, token)) ?? booking;
  }

  const redirectFailed = one(sp.redirect_status) === "failed";
  // Request time for "deadline passed" states. Server component on a force-dynamic route: runs once per request and
  // never re-renders on the client, so reading the clock here is safe.
  // eslint-disable-next-line react-hooks/purity
  const requestTime = Date.now();

  const accent = <ListingTheme accent={booking.property.accent_color} preset={booking.property.theme_preset} />;
  if (PAID.has(booking.status)) {
    const [rawSections, review] = await Promise.all([getGuestOnlySections(booking.property_id), getBookingReview(booking.id)]);
    const extras: PassExtras = {
      token,
      now: requestTime,
      review,
      reviewable: !review && canReview(booking, booking.property.timezone),
      payable: balancePayable(booking, booking.property.timezone),
      stripeKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null,
      localAvailable: billplzAvailableFor(booking.property),
      balanceFailed: one(sp.balance_status) === "failed" || one(sp.redirect_status) === "failed",
    };
    return (
      <>
        {accent}
        <Confirmed booking={booking} t={t} guestSections={parseSections(rawSections)} extras={extras} />
      </>
    );
  }
  return (
    <>
      {accent}
      {booking.status === "pending_payment" && !redirectFailed ? <Processing booking={booking} t={t} /> : <NotCompleted booking={booking} failed={redirectFailed} t={t} />}
    </>
  );
}

interface PassExtras {
  token: string;
  review: PublicReview | null;
  reviewable: boolean;
  payable: boolean;
  stripeKey: string | null;
  localAvailable: boolean;
  balanceFailed: boolean;
  /** Request time (ms), for showing past cancellation deadlines as passed. */
  now: number;
}

function Confirmed({ booking, t, guestSections, extras }: { booking: BookingWithProperty; t: T; guestSections: ReturnType<typeof parseSections>; extras: PassExtras }) {
  const p = booking.property;
  const locale = t.locale;
  const text = localizeProperty(p, locale);
  const quote = quoteFromSnapshot(booking);
  const outstanding = Math.max(0, booking.total_amount - booking.amount_paid);
  const location = [p.address_line, p.city, p.region].filter(Boolean).join(", ");
  const passUrl = `${publicEnv.siteUrl}/host/check-in/${booking.reference}`;

  return (
    <div className="surface-muted min-h-[calc(100dvh-4rem)]">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full border border-brass/60 text-brand-700 dark:text-brand-300">
            <CircleCheck className="size-7" aria-hidden />
          </div>
          <p className="mt-5 font-display text-xl text-zinc-600 italic dark:text-zinc-400">{t("rc.welcome", { name: booking.guest_name.split(" ")[0] ?? booking.guest_name })}</p>
          <h1 className="display mt-1 text-4xl text-balance sm:text-5xl">{t("rc.goingTo", { city: p.city })}</h1>
          <AwanDivider className="mx-auto mt-5 text-brass/70" />
          <p className="mx-auto mt-2 max-w-xl text-zinc-600 dark:text-zinc-400">
            {booking.status === "paid_in_full" ? t("rc.fullyPaid") : t("rc.depositIn")} {t("rc.savePage")}
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-3xl border border-brass/40 bg-paper shadow-float dark:border-brass/30 dark:bg-zinc-900">
          <RebungBand className="text-brass/40" />
          <div className="grid md:grid-cols-[1fr_280px]">
            <div className="p-6 sm:p-8">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("rc.booking", { ref: booking.reference })}</p>
                  <h2 className="display mt-1 text-3xl">{text.title}</h2>
                </div>
                <StatusBadge status={booking.status} label={t(`status.${booking.status}`)} />
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                <Detail icon={CalendarDays} label={t("rc.checkIn")} value={formatDateLong(booking.check_in, locale)} sub={t("rc.from", { time: formatTime(p.check_in_time, locale) })} />
                <Detail icon={CalendarDays} label={t("rc.checkOut")} value={formatDateLong(booking.check_out, locale)} sub={t("rc.by", { time: formatTime(p.check_out_time, locale) })} />
                <Detail icon={Users} label={t("rc.guests")} value={guestSummary(booking, locale)} sub={`${booking.guest_name} · ${booking.guest_email}`} />
                <Detail icon={MapPin} label={t("rc.address")} value={location || p.city} sub={p.country} />
              </dl>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-500/10">
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">{t("rc.paid")}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{formatMoney(booking.amount_paid, booking.currency)}</p>
                </div>
                <div className="rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-800/60">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">{t("rc.dueCheckIn")}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{formatMoney(outstanding, booking.currency)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center border-t border-dashed border-zinc-300 bg-gradient-to-b from-zinc-50 to-white p-8 md:border-t-0 md:border-l dark:border-zinc-700 dark:from-zinc-900 dark:to-zinc-950">
              <QrPass value={passUrl} reference={booking.reference} />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <ReceiptActions
            title={text.title}
            reference={booking.reference}
            checkIn={booking.check_in}
            checkOut={booking.check_out}
            checkInTime={p.check_in_time}
            checkOutTime={p.check_out_time}
            location={location || p.city}
            timeZone={p.timezone}
          />
          {p.host_phone && (
            <a
              href={whatsappLink(p.host_phone, `Hi${p.host_display_name ? ` ${p.host_display_name}` : ""}! I've booked ${p.title} (${booking.reference}).`)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonStyles({ variant: "whatsapp", size: "sm", className: "no-print" })}
            >
              <MessageCircle className="size-4" aria-hidden /> {t("rc.messageHost", { name: p.host_display_name ?? "host" })}
            </a>
          )}
        </div>

        {extras.balanceFailed && extras.payable && (
          <p role="alert" className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {t("bal.failed")}
          </p>
        )}
        {extras.payable && (extras.stripeKey || extras.localAvailable) && (
          <BalancePay
            bookingId={booking.id}
            token={extras.token}
            amountLabel={formatMoney(outstanding, booking.currency)}
            stripeKey={extras.stripeKey}
            localAvailable={extras.localAvailable}
          />
        )}

        {guestSections.some((s) => s.visible) && (
          <section className="card mt-8 p-6 sm:p-8">
            <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase dark:text-brand-300">{t("rc.forYourStay")}</p>
            <p className="mt-1 text-xs text-zinc-500">{t("rc.forYourStay.hint")}</p>
            <ContentSections sections={guestSections} locale={locale} variant="receipt" />
          </section>
        )}

        <section className="card mt-8 p-6 sm:p-8">
          <h2 className="display mb-4 text-2xl">{t("rc.priceDetails")}</h2>
          <PriceBreakdown quote={quote} hideSplit locale={locale} />
          {booking.status !== "checked_in" && booking.status !== "completed" && (
            <CancellationSchedule
              className="mt-6 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80"
              preset={isCancellationPreset(booking.cancellation_preset) ? booking.cancellation_preset : "custom"}
              checkIn={booking.check_in}
              checkInTime={p.check_in_time}
              paid={splitPaid(booking)}
              currency={booking.currency}
              locale={locale}
              customText={booking.cancellation_policy_text ?? text.cancellation_policy}
              timeZone={p.timezone}
              now={extras.now}
            />
          )}
          <DepositNote
            className="mt-5 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80"
            amount={booking.security_deposit}
            days={booking.security_deposit_return_days}
            collectedNow={booking.payment_policy === "full" || booking.amount_paid >= booking.total_amount}
            currency={booking.currency}
            locale={locale}
            status={{ returned: booking.deposit_returned_amount, at: booking.deposit_returned_at, note: booking.deposit_return_note }}
          />
        </section>

        {(extras.review || extras.reviewable) && (
          <section id="review" className="card mt-8 scroll-mt-24 p-6 sm:p-8 no-print">
            <h2 className="display text-2xl">{extras.review ? t("rv.yours") : t("rv.prompt")}</h2>
            {extras.review ? (
              <div className="mt-4">
                <ReviewList items={[extras.review]} locale={locale} hostName={p.host_display_name} />
              </div>
            ) : (
              <ReviewForm bookingId={booking.id} token={extras.token} defaultName={`${booking.guest_name.split(" ")[0] ?? ""} ${booking.guest_name.split(" ")[1]?.[0] ?? ""}`.trim()} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Processing({ booking, t }: { booking: BookingWithProperty; t: T }) {
  return (
    <StateCard
      icon={Hourglass}
      tone="neutral"
      title={t("rc.almost")}
      body={t("rc.confirming", { amount: formatMoney(booking.amount_due_now, booking.currency), title: localizeProperty(booking.property, t.locale).title })}
    >
      <PaymentStatusPoller />
    </StateCard>
  );
}

function NotCompleted({ booking, failed, t }: { booking: BookingWithProperty; failed: boolean; t: T }) {
  const rebook = `/stays/${booking.property.slug}?${new URLSearchParams({
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    adults: String(booking.adults),
    children: String(booking.children),
    infants: String(booking.infants),
  })}`;

  if (booking.status === "cancelled") {
    const conflict = booking.cancellation_reason === "payment_after_hold_conflict";
    return (
      <StateCard
        icon={XCircle}
        tone="danger"
        title={t("rc.cancelled")}
        body={
          conflict
            ? t("rc.cancelled.conflict")
            : (booking.cancellation_reason ?? t("rc.cancelled.contact"))
        }
      >
        <Link href={`/stays/${booking.property.slug}`} className={buttonStyles({ className: "mt-6" })}>
          {t("rc.findOther")}
        </Link>
      </StateCard>
    );
  }

  return (
    <StateCard
      icon={failed ? CircleAlert : Clock}
      tone="warning"
      title={failed ? t("rc.failed") : t("rc.expired")}
      body={failed ? t("rc.failed.body") : t("rc.expired.body")}
    >
      <Link href={rebook} className={buttonStyles({ className: "mt-6" })}>
        {failed ? t("rc.tryAgain") : t("rc.checkAvailability")}
      </Link>
    </StateCard>
  );
}

function StateCard({
  icon: Icon,
  tone,
  title,
  body,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "neutral" | "warning" | "danger";
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    warning: "bg-terracotta-500/10 text-terracotta-600",
    danger: "bg-red-50 text-red-600 dark:bg-red-500/10",
  }[tone];
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <div className={`mx-auto grid size-14 place-items-center rounded-full ${toneClass}`}>
        <Icon className="size-7" />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{body}</p>
      {children}
    </div>
  );
}

function Detail({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string | null }) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-zinc-400" />
      <div className="min-w-0">
        <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
        <dd className="mt-0.5 font-medium">{value}</dd>
        {sub && <dd className="break-words text-zinc-500">{sub}</dd>}
      </div>
    </div>
  );
}
