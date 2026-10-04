"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  addDays,
  addMonths,
  diffDays,
  eachNight,
  formatDateLong,
  formatMonth,
  monthGrid,
  startOfMonth,
  type ISODate,
} from "@/lib/dates";
import { useT } from "@/components/i18n/locale";
import { cn } from "@/lib/utils";

export interface DateRange {
  checkIn: ISODate | null;
  checkOut: ISODate | null;
}

export interface NightPrice {
  /** Compact label shown under the day number, e.g. "380". */
  label: string;
  /** Accessible full price, e.g. "RM 380". */
  full: string;
  weekend: boolean;
}

interface DateRangeCalendarProps extends DateRange {
  onChange: (range: DateRange) => void;
  today: ISODate;
  maxDate: ISODate;
  /** Nights that cannot be booked (booked or blocked). */
  unavailable: ReadonlySet<ISODate>;
  /** Subset of `unavailable` closed by the host (styled differently). */
  blocked?: ReadonlySet<ISODate>;
  minNights: number;
  maxNights: number;
  months?: 1 | 2;
  priceFor?: (night: ISODate) => NightPrice;
  className?: string;
}


export function DateRangeCalendar({
  checkIn,
  checkOut,
  onChange,
  today,
  maxDate,
  unavailable,
  blocked,
  minNights,
  maxNights,
  months = 1,
  priceFor,
  className,
}: DateRangeCalendarProps) {
  const t = useT();
  const WEEKDAYS = t("cal.weekdays").split(",");
  const firstMonth = startOfMonth(today);
  const lastMonth = startOfMonth(maxDate);
  const [view, setView] = useState<ISODate>(() => startOfMonth(checkIn ?? today));
  const [direction, setDirection] = useState<1 | -1>(1);
  const [hover, setHover] = useState<ISODate | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const selectingCheckout = checkIn !== null && checkOut === null;

  const isNightFree = useCallback(
    (d: ISODate) => d >= today && d < maxDate && !unavailable.has(d),
    [today, maxDate, unavailable],
  );

  const isValidCheckout = useCallback(
    (d: ISODate) => {
      if (!checkIn || d <= checkIn) return false;
      const n = diffDays(checkIn, d);
      if (n < minNights || n > maxNights) return false;
      return eachNight(checkIn, d).every((night) => !unavailable.has(night));
    },
    [checkIn, minNights, maxNights, unavailable],
  );

  const selectDay = (d: ISODate) => {
    if (selectingCheckout && checkIn) {
      if (isValidCheckout(d)) {
        onChange({ checkIn, checkOut: d });
        return;
      }
      if (isNightFree(d)) onChange({ checkIn: d, checkOut: null });
      return;
    }
    if (isNightFree(d)) onChange({ checkIn: d, checkOut: null });
  };

  const dayState = (d: ISODate) => {
    const past = d < today || d > maxDate;
    const nightTaken = unavailable.has(d);
    const isBlocked = blocked?.has(d) ?? false;
    const selectable = selectingCheckout && checkIn && d > checkIn ? isValidCheckout(d) : isNightFree(d);
    const end = checkOut ?? (selectingCheckout && hover && isValidCheckout(hover) ? hover : null);
    const isStart = d === checkIn;
    const isEnd = d === end;
    const inRange = !!checkIn && !!end && d > checkIn && d < end;
    return { past, nightTaken, isBlocked, selectable, isStart, isEnd, inRange, hasEnd: !!end };
  };

  const go = (delta: 1 | -1) => {
    const next = addMonths(view, delta);
    if (next < firstMonth || next > lastMonth) return;
    setDirection(delta);
    setView(next);
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = (e.target as HTMLElement).dataset.date;
    if (!current) return;
    const delta = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = addDays(current, delta);
    if (next < today || next > maxDate) return;
    const nextMonth = startOfMonth(next);
    const visibleEnd = addMonths(view, months - 1);
    if (nextMonth < view || nextMonth > visibleEnd) {
      setDirection(delta > 0 ? 1 : -1);
      setView(addMonths(view, delta > 0 ? 1 : -1));
    }
    requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  };

  const visibleMonths = useMemo(() => Array.from({ length: months }, (_, i) => addMonths(view, i)), [view, months]);

  return (
    <div className={cn("select-none", className)}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-between">
          <NavButton label={t("cal.prev")} disabled={view <= firstMonth} onClick={() => go(-1)}>
            <ChevronLeft className="size-4" />
          </NavButton>
          <NavButton label={t("cal.next")} disabled={addMonths(view, months - 1) >= lastMonth} onClick={() => go(1)}>
            <ChevronRight className="size-4" />
          </NavButton>
        </div>

        <div ref={gridRef} onKeyDown={onGridKeyDown} className="overflow-hidden" onMouseLeave={() => setHover(null)}>
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={view}
              initial={{ x: direction * 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -40, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className={cn("grid gap-8", months === 2 && "md:grid-cols-2")}
            >
              {visibleMonths.map((month, idx) => (
                <div key={month} className={cn(idx === 1 && "hidden md:block")}>
                  <p className="mb-4 flex h-8 items-center justify-center text-[15px] font-semibold tracking-tight">{formatMonth(month, t.locale)}</p>
                  <div className="grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wider text-zinc-500" aria-hidden>
                    {WEEKDAYS.map((w) => (
                      <span key={w} className="pb-2">
                        {w}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-y-1" aria-label={formatMonth(month, t.locale)}>
                    {monthGrid(month).map((d, i) => {
                      if (!d) return <span key={`pad-${i}`} aria-hidden />;
                      const s = dayState(d);
                      const price = priceFor && !s.past && !s.nightTaken ? priceFor(d) : null;
                      const status = s.past
                        ? t("cal.status.unavailable")
                        : s.isBlocked && !s.selectable
                          ? t("cal.status.closed")
                          : s.nightTaken
                            ? s.selectable
                              ? t("cal.status.checkoutOnly")
                              : t("cal.status.booked")
                            : t("cal.status.available");
                      return (
                        <div
                          key={d}
                          className={cn(
                            "relative flex justify-center",
                            s.inRange && "bg-brand-50 dark:bg-brand-500/10",
                            s.isStart && s.hasEnd && "bg-gradient-to-r from-transparent from-50% to-brand-50 to-50% dark:to-brand-500/10",
                            s.isEnd && "bg-gradient-to-l from-transparent from-50% to-brand-50 to-50% dark:to-brand-500/10",
                          )}
                        >
                          <button
                            type="button"
                            data-date={d}
                            disabled={!s.selectable}
                            onClick={() => selectDay(d)}
                            onMouseEnter={() => setHover(d)}
                            onFocus={() => setHover(d)}
                            aria-pressed={s.isStart || s.isEnd}
                            aria-label={`${formatDateLong(d, t.locale)}, ${status}${price ? `, ${t("cal.perNight", { price: price.full })}` : ""}`}
                            className={cn(
                              "relative z-[1] flex aspect-square w-full max-w-12 flex-col items-center justify-center rounded-full text-sm font-medium transition-all duration-150",
                              s.selectable && !s.isStart && !s.isEnd && "hover:ring-1 hover:ring-ink dark:hover:ring-white",
                              !s.selectable && "cursor-not-allowed",
                              s.past && "text-zinc-300 dark:text-zinc-700",
                              !s.past && s.nightTaken && !s.selectable && "text-zinc-300 line-through decoration-zinc-300 dark:text-zinc-600",
                              !s.past && s.isBlocked && !s.selectable && "bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgb(0_0_0/0.05)_4px,rgb(0_0_0/0.05)_8px)]",
                              (s.isStart || s.isEnd) && "bg-ink text-white shadow-soft dark:bg-paper dark:text-ink",
                            )}
                          >
                            <span className="leading-none">{Number(d.slice(8))}</span>
                            {price && (
                              <span
                                className={cn(
                                  "mt-0.5 text-[9.5px] leading-none font-semibold tabular-nums",
                                  s.isStart || s.isEnd ? "text-white/70 dark:text-ink/60" : price.weekend ? "text-terracotta-600" : "text-zinc-500",
                                )}
                              >
                                {price.label}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
        <Legend swatch="bg-ink dark:bg-paper" label={t("cal.legend.selected")} />
        {priceFor && <Legend swatch="bg-terracotta-500" label={t("cal.legend.weekend")} />}
        <Legend swatch="bg-zinc-200 dark:bg-zinc-700" label={t("cal.legend.unavailable")} strike />
        {selectingCheckout && <span className="ml-auto font-medium text-brand-700 dark:text-brand-400">{t("cal.pickCheckout")}</span>}
      </div>
    </div>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="pointer-events-auto grid size-8 place-items-center rounded-full border border-zinc-200/80 bg-paper text-zinc-700 transition hover:shadow-soft disabled:opacity-30 dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-300"
    >
      {children}
    </button>
  );
}

function Legend({ swatch, label, strike }: { swatch: string; label: string; strike?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", swatch)} />
      <span className={cn(strike && "line-through")}>{label}</span>
    </span>
  );
}
