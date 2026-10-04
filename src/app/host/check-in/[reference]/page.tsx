import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckInForm } from "@/components/host/check-in-form";
import { buttonStyles } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateLong, todayInTimeZone } from "@/lib/dates";
import { formatMoney, guestSummary } from "@/lib/pricing";
import { requireUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Check-in" };

type Props = { params: Promise<{ reference: string }> };

export default async function CheckInPage({ params }: Props) {
  const { reference } = await params;
  const { supabase } = await requireUser(`/host/check-in/${reference}`);

  const { data: booking } = await supabase
    .from("bookings")
    .select("*, property:properties(title, timezone)")
    .eq("reference", reference.toUpperCase())
    .maybeSingle();

  if (!booking) {
    return (
      <div className="card mx-auto max-w-md p-10 text-center">
        <CircleAlert className="mx-auto size-10 text-terracotta-500" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">Pass not found</h1>
        <p className="mt-2 text-sm text-zinc-500">
          No booking <span className="font-mono">{reference}</span> exists for your properties.
        </p>
        <Link href="/host/bookings" className={buttonStyles({ variant: "outline", className: "mt-6" })}>
          Back to bookings
        </Link>
      </div>
    );
  }

  const property = booking.property as unknown as { title: string; timezone: string };
  const outstanding = Math.max(0, booking.total_amount - booking.amount_paid);
  const today = todayInTimeZone(property.timezone);
  const early = booking.check_in > today;
  const done = booking.status === "checked_in" || booking.status === "completed";
  const checkable = booking.status === "confirmed" || booking.status === "paid_in_full";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="text-center">
        <p className="font-mono text-sm font-semibold tracking-[0.2em] text-zinc-500">{booking.reference}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{booking.guest_name}</h1>
        <div className="mt-3 flex justify-center">
          <StatusBadge status={booking.status} />
        </div>
      </header>

      <section className="card divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
        <Row label="Property" value={property.title} />
        <Row label="Check-in" value={formatDateLong(booking.check_in)} />
        <Row label="Check-out" value={formatDateLong(booking.check_out)} />
        <Row label="Guests" value={guestSummary(booking)} />
        <Row label="Paid so far" value={formatMoney(booking.amount_paid, booking.currency)} />
        <Row label="Due now" value={formatMoney(outstanding, booking.currency)} highlight={outstanding > 0} />
      </section>

      {early && checkable && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Heads up: this stay starts on {formatDateLong(booking.check_in)}.
        </p>
      )}

      {done ? (
        <div className="rounded-2xl bg-brand-50 p-6 text-center dark:bg-brand-500/10">
          <CircleCheck className="mx-auto size-10 text-brand-600" aria-hidden />
          <p className="mt-2 font-semibold">
            Checked in
            {booking.checked_in_at
              ? ` · ${new Date(booking.checked_in_at).toLocaleString("en-MY", { timeZone: property.timezone, dateStyle: "medium", timeStyle: "short" })}`
              : ""}
          </p>
        </div>
      ) : checkable ? (
        <CheckInForm bookingId={booking.id} outstandingLabel={formatMoney(outstanding, booking.currency)} hasOutstanding={outstanding > 0} />
      ) : (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          This booking can&apos;t be checked in (status: {booking.status.replace("_", " ")}).
        </p>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={highlight ? "font-bold text-terracotta-600" : "text-right font-medium"}>{value}</span>
    </div>
  );
}
