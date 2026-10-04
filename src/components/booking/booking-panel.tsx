"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ChevronDown, CircleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDateShort } from "@/lib/dates";
import { formatMoney, guestSummary } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n/locale";
import { buttonStyles } from "@/components/ui/button";
import { useBooking } from "./booking-context";
import { DateRangeCalendar } from "./date-range-calendar";
import { GuestSelector } from "./guest-selector";
import { PriceBreakdown } from "./price-breakdown";

type Section = "dates" | "guests" | null;

export function BookingPanel({ variant = "card" }: { variant?: "card" | "sheet" }) {
  const b = useBooking();
  const t = useT();
  const [open, setOpen] = useState<Section>(variant === "sheet" && !b.range.checkOut ? "dates" : null);
  const toggle = (s: Exclude<Section, null>) => setOpen((cur) => (cur === s ? null : s));

  const nights = b.quote?.nights ?? 0;

  return (
    <div className={cn(variant === "card" && "card relative overflow-hidden p-6 shadow-float")}>
      {variant === "card" && <span className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brass to-transparent" aria-hidden />}
      {variant === "card" && (
        <div className="mb-5 flex items-baseline justify-between">
          <p>
            {b.quote ? (
              <>
                <span className="font-display text-[2rem] leading-none font-semibold">{formatMoney(Math.round(b.quote.subtotal / nights), b.property.currency)}</span>
                <span className="text-zinc-500"> {t("panel.avgNight")}</span>
              </>
            ) : (
              <>
                <span className="text-sm text-zinc-500">{t("panel.from")} </span>
                <span className="font-display text-[2rem] leading-none font-semibold">{formatMoney(b.fromPrice, b.property.currency)}</span>
                <span className="text-zinc-500"> {t("panel.perNight")}</span>
              </>
            )}
          </p>
          <span className="text-xs text-zinc-500">{t("panel.minNights", { n: b.property.min_nights })}</span>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-zinc-300/80 dark:border-zinc-700/80">
        <div className="grid grid-cols-2 divide-x divide-zinc-300/80 dark:divide-zinc-700/80">
          <FieldButton label={t("panel.checkIn")} value={b.range.checkIn ? formatDateShort(b.range.checkIn, t.locale) : t("panel.addDate")} active={open === "dates"} onClick={() => toggle("dates")} />
          <FieldButton label={t("panel.checkOut")} value={b.range.checkOut ? formatDateShort(b.range.checkOut, t.locale) : t("panel.addDate")} active={open === "dates"} onClick={() => toggle("dates")} />
        </div>
        <div className="border-t border-zinc-300/80 dark:border-zinc-700/80">
          <FieldButton label={t("panel.guests")} value={guestSummary(b.guests, t.locale)} active={open === "guests"} onClick={() => toggle("guests")} chevron />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={open}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-5">
              {open === "dates" ? (
                <>
                  <DateRangeCalendar
                    checkIn={b.range.checkIn}
                    checkOut={b.range.checkOut}
                    onChange={(r) => {
                      b.setRange(r);
                      if (r.checkIn && r.checkOut && variant === "card") setOpen(null);
                    }}
                    today={b.today}
                    maxDate={b.maxDate}
                    unavailable={b.unavailable}
                    blocked={b.blocked}
                    minNights={b.property.min_nights}
                    maxNights={b.property.max_nights}
                    priceFor={b.priceFor}
                  />
                  {(b.range.checkIn || b.range.checkOut) && (
                    <button type="button" onClick={b.clearDates} className="mt-3 text-sm font-semibold underline underline-offset-4">
                      {t("panel.clearDates")}
                    </button>
                  )}
                </>
              ) : (
                <GuestSelector value={b.guests} onChange={b.setGuests} maxGuests={b.property.max_guests} maxInfants={b.property.max_infants} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(b.stayError || (b.guestError && b.quote)) && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {b.stayError ?? b.guestError}
        </p>
      )}

      {variant === "card" && (
        <div className="mt-5">
          {b.checkoutHref ? (
            <Link href={b.checkoutHref} className={buttonStyles({ size: "lg", className: "w-full" })}>
              {b.quote?.policy === "full" ? t("panel.reserveFull") : t("panel.reserveDeposit")}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={() => setOpen("dates")} className={buttonStyles({ size: "lg", className: "w-full" })}>
              {t("panel.checkAvailability")}
            </button>
          )}
          <p className="mt-2.5 text-center text-xs text-zinc-500">{t("panel.noChargeYet")}</p>
        </div>
      )}

      <AnimatePresence initial={false}>
        {b.quote && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6"
          >
            <PriceBreakdown quote={b.quote} locale={t.locale} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldButton({ label, value, active, onClick, chevron }: { label: string; value: string; active: boolean; onClick: () => void; chevron?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-left transition",
        active ? "bg-zinc-50 dark:bg-zinc-800/60" : "hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40",
      )}
    >
      <span>
        <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="mt-0.5 block text-[15px] font-medium">{value}</span>
      </span>
      {chevron && <ChevronDown className={cn("size-4 text-zinc-500 transition-transform", active && "rotate-180")} aria-hidden />}
    </button>
  );
}
