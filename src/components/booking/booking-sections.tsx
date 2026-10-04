"use client";

import { ArrowRight, CalendarDays, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { formatRange } from "@/lib/dates";
import { formatMoney, guestSummary } from "@/lib/pricing";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useT } from "@/components/i18n/locale";
import { buttonStyles } from "@/components/ui/button";
import { useBooking } from "./booking-context";
import { BookingPanel } from "./booking-panel";
import { DateRangeCalendar } from "./date-range-calendar";

/** Sticky bottom bar on mobile; opens the booking flow in a bottom sheet. */
export function MobileBookingBar() {
  const b = useBooking();
  const t = useT();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <div className="glass pb-safe fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 px-4 pt-3 lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
          <button type="button" onClick={() => setOpen(true)} className="text-left">
            {b.quote ? (
              <>
                <p className="text-[15px] font-semibold">
                  {formatMoney(b.quote.dueNow, b.property.currency)} <span className="font-normal text-zinc-500">{t("mobile.dueToday")}</span>
                </p>
                <p className="text-xs font-medium text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
                  {b.range.checkIn && b.range.checkOut && formatRange(b.range.checkIn, b.range.checkOut, t.locale)} · {t.plural("stay.nights", b.quote.nights)}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold">
                  {formatMoney(b.fromPrice, b.property.currency)} <span className="font-normal text-zinc-500">{t("panel.perNight")}</span>
                </p>
                <p className="text-xs font-medium text-zinc-600 underline underline-offset-2 dark:text-zinc-400">{t("mobile.addDates")}</p>
              </>
            )}
          </button>
          {b.checkoutHref ? (
            <Link href={b.checkoutHref} className={buttonStyles({ className: "px-6" })}>
              {t("mobile.reserve")}
            </Link>
          ) : (
            <button type="button" onClick={() => setOpen(true)} className={buttonStyles({ className: "px-6" })}>
              {t("mobile.checkDates")}
            </button>
          )}
        </div>
      </div>

      <BottomSheet
        open={open}
        onClose={close}
        title={b.quote ? t.plural("stay.nights", b.quote.nights) : t("mobile.selectDates")}
        footer={
          b.checkoutHref ? (
            <Link href={b.checkoutHref} className={buttonStyles({ size: "lg", className: "w-full" })}>
              {t("mobile.reserveToday", { amount: formatMoney(b.quote?.dueNow ?? 0, b.property.currency) })}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <button type="button" disabled className={buttonStyles({ size: "lg", className: "w-full" })}>
              {b.range.checkIn ? t("mobile.selectCheckOut") : t("mobile.selectCheckIn")}
            </button>
          )
        }
      >
        <BookingPanel variant="sheet" />
      </BottomSheet>
    </>
  );
}

/** Large in-page availability calendar (two months on desktop). */
export function AvailabilitySection() {
  const b = useBooking();
  const t = useT();
  return (
    <section id="availability" aria-labelledby="availability-heading" className="scroll-mt-24 border-t border-zinc-200/80 py-12 dark:border-zinc-800/80">
      <p className="eyebrow">{t("eb.availability")}</p>
      <h2 id="availability-heading" className="display mt-2 text-3xl sm:text-[2.4rem]">
        {b.quote ? t("avail.selected", { n: b.quote.nights }) : t("avail.title")}
      </h2>
      <p className="mt-1 text-sm text-zinc-500">
        {b.range.checkIn && b.range.checkOut
          ? formatRange(b.range.checkIn, b.range.checkOut, t.locale)
          : t("avail.rates", { weekend: formatMoney(b.property.weekend_rate, b.property.currency), weekday: formatMoney(b.property.weekday_rate, b.property.currency) })}
      </p>
      <DateRangeCalendar
        className="mt-6"
        months={2}
        checkIn={b.range.checkIn}
        checkOut={b.range.checkOut}
        onChange={b.setRange}
        today={b.today}
        maxDate={b.maxDate}
        unavailable={b.unavailable}
        blocked={b.blocked}
        minNights={b.property.min_nights}
        maxNights={b.property.max_nights}
        priceFor={b.priceFor}
      />
    </section>
  );
}

/** Floating booking bar that overlaps the Grand hero (desktop). Mobile keeps the sticky bottom bar. */
export function HeroBookingBar() {
  const b = useBooking();
  const t = useT();
  const toCalendar = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("availability")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const dates = b.range.checkIn && b.range.checkOut ? formatRange(b.range.checkIn, b.range.checkOut, t.locale) : t("panel.addDate");

  return (
    <div className="relative z-20 mx-auto -mt-11 hidden max-w-4xl px-6 lg:block">
      <div className="flex items-center gap-2 rounded-full border border-brass/30 bg-paper/95 p-2 pl-3 shadow-float backdrop-blur dark:border-brass/30 dark:bg-zinc-900/95">
        <button type="button" onClick={toCalendar} className="flex min-w-0 flex-1 items-center gap-3 rounded-full px-4 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <CalendarDays className="size-4 shrink-0 text-brass-ink dark:text-brass-light" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[10px] font-bold tracking-[0.18em] text-zinc-500 uppercase">{t("panel.checkIn")} — {t("panel.checkOut")}</span>
            <span className="block truncate text-[15px] font-medium">{dates}</span>
          </span>
        </button>
        <span className="h-8 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
        <button type="button" onClick={toCalendar} className="flex items-center gap-3 rounded-full px-4 py-2 text-left transition hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <Users className="size-4 shrink-0 text-brass-ink dark:text-brass-light" aria-hidden />
          <span>
            <span className="block text-[10px] font-bold tracking-[0.18em] text-zinc-500 uppercase">{t("panel.guests")}</span>
            <span className="block text-[15px] font-medium whitespace-nowrap">{guestSummary(b.guests, t.locale)}</span>
          </span>
        </button>
        <span className="hidden px-3 text-right xl:block">
          <span className="block text-[10px] font-bold tracking-[0.18em] text-zinc-500 uppercase">{t("panel.from")}</span>
          <span className="font-display text-xl font-semibold">{formatMoney(b.fromPrice, b.property.currency)}</span>
        </span>
        {b.checkoutHref ? (
          <Link href={b.checkoutHref} className={buttonStyles({ size: "lg", className: "rounded-full px-7" })}>
            {b.quote?.policy === "full" ? t("panel.reserveFull") : t("panel.reserveDeposit")} <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : (
          <button type="button" onClick={toCalendar} className={buttonStyles({ size: "lg", className: "rounded-full px-7" })}>
            {t("panel.checkAvailability")}
          </button>
        )}
      </div>
    </div>
  );
}
