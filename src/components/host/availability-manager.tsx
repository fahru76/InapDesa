"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Lock, LockOpen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { setBlockedRange } from "@/app/host/actions";
import { addMonths, diffDays, eachNight, formatDateShort, formatMonth, isoDayOfWeek, monthGrid, startOfMonth, type ISODate } from "@/lib/dates";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";

export interface CalendarBooking {
  id: string;
  reference: string;
  guest_name: string;
  check_in: ISODate;
  check_out: ISODate;
  status: string;
}

interface Props {
  propertyId: string;
  today: ISODate;
  bookings: CalendarBooking[];
  blocked: { date: ISODate; reason: string | null }[];
  rates: { weekday: number; weekend: number; weekendDays: number[]; currency: string };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AvailabilityManager({ propertyId, today, bookings, blocked, rates }: Props) {
  const router = useRouter();
  const [month, setMonth] = useState(startOfMonth(today));
  const [start, setStart] = useState<ISODate | null>(null);
  const [end, setEnd] = useState<ISODate | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const nightBooking = useMemo(() => {
    const map = new Map<ISODate, CalendarBooking>();
    for (const b of bookings) for (const n of eachNight(b.check_in, b.check_out)) map.set(n, b);
    return map;
  }, [bookings]);
  const blockedMap = useMemo(() => new Map(blocked.map((b) => [b.date, b.reason])), [blocked]);

  const [lo, hi] = start && end ? (start <= end ? [start, end] : [end, start]) : start ? [start, start] : [null, null];
  const selectedCount = lo && hi ? diffDays(lo, hi) + 1 : 0;

  const onDay = (d: ISODate) => {
    if (d < today) return;
    if (!start || end) {
      setStart(d);
      setEnd(null);
    } else {
      setEnd(d);
    }
  };

  const clear = () => {
    setStart(null);
    setEnd(null);
    setReason("");
  };

  const apply = (block: boolean) => {
    if (!lo || !hi) return;
    startTransition(async () => {
      const res = await setBlockedRange(propertyId, lo, hi, block, reason);
      setToast({ ok: res.ok, text: res.message ?? (res.ok ? "Saved" : "Something went wrong") });
      if (res.ok) {
        clear();
        router.refresh();
      }
      setTimeout(() => setToast(null), 3500);
    });
  };

  return (
    <div>
      <div className="card p-4 sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">{formatMonth(month)}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={month <= startOfMonth(today)}
              onClick={() => setMonth(addMonths(month, -1))}
              className="grid size-9 place-items-center rounded-full border border-zinc-200/80 transition hover:shadow-soft disabled:opacity-30 dark:border-zinc-800/80"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(addMonths(month, 1))}
              className="grid size-9 place-items-center rounded-full border border-zinc-200/80 transition hover:shadow-soft dark:border-zinc-800/80"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider text-zinc-400 sm:gap-2">
          {WEEKDAYS.map((w) => (
            <span key={w} className="pb-1">
              <span className="sm:hidden">{w[0]}</span>
              <span className="hidden sm:inline">{w}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {monthGrid(month).map((d, i) => {
            if (!d) return <span key={`pad-${i}`} />;
            const booking = nightBooking.get(d);
            const isBlocked = blockedMap.has(d);
            const past = d < today;
            const selected = !!lo && !!hi && d >= lo && d <= hi;
            const weekend = rates.weekendDays.includes(isoDayOfWeek(d));
            const isCheckInDay = booking?.check_in === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDay(d)}
                disabled={past}
                title={booking ? `${booking.guest_name} · ${booking.reference}` : isBlocked ? (blockedMap.get(d) ?? "Closed") : undefined}
                aria-pressed={selected}
                aria-label={`${formatDateShort(d)}${booking ? `, booked by ${booking.guest_name}` : isBlocked ? ", closed" : ", open"}`}
                className={cn(
                  "relative flex aspect-square flex-col items-start justify-between overflow-hidden rounded-xl border p-1.5 text-left transition sm:aspect-[1.15] sm:p-2",
                  past && "cursor-not-allowed border-transparent opacity-40",
                  !past && !booking && !isBlocked && "border-zinc-200/80 bg-paper hover:border-zinc-400 dark:border-zinc-800/80 dark:bg-zinc-900",
                  booking &&
                    (booking.status === "pending_payment"
                      ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"
                      : "border-brand-200 bg-brand-50 dark:border-brand-500/20 dark:bg-brand-500/10"),
                  isBlocked &&
                    !booking &&
                    "border-zinc-300 bg-[repeating-linear-gradient(135deg,rgb(244_244_245),rgb(244_244_245)_6px,rgb(228_228_231)_6px,rgb(228_228_231)_12px)] dark:border-zinc-700 dark:bg-[repeating-linear-gradient(135deg,rgb(24_24_27),rgb(24_24_27)_6px,rgb(39_39_42)_6px,rgb(39_39_42)_12px)]",
                  selected && "ring-2 ring-ink ring-offset-1 dark:ring-white dark:ring-offset-zinc-950",
                )}
              >
                <span className={cn("text-xs font-semibold sm:text-sm", d === today && "rounded-full bg-terracotta-500 px-1.5 text-white")}>{Number(d.slice(8))}</span>
                {booking ? (
                  <span className="w-full truncate text-[10px] font-semibold text-brand-800 sm:text-xs dark:text-brand-300">{isCheckInDay ? booking.guest_name.split(" ")[0] : "•"}</span>
                ) : isBlocked ? (
                  <Lock className="size-3 text-zinc-500" aria-hidden />
                ) : (
                  <span className={cn("hidden text-[11px] tabular-nums sm:block", weekend ? "text-terracotta-600" : "text-zinc-400")}>
                    {formatMoney(weekend ? rates.weekend : rates.weekday, rates.currency)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-brand-100 ring-1 ring-brand-200" /> Booked
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded bg-amber-100 ring-1 ring-amber-200" /> Awaiting payment
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3" /> Closed by you
          </span>
          <span className="sm:ml-auto">Tap a day, then another, to select a range.</span>
        </div>
      </div>

      <AnimatePresence>
        {lo && hi && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="glass sticky bottom-24 z-20 mt-4 rounded-2xl p-4 shadow-float lg:bottom-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="text-sm font-semibold">
                {selectedCount} night{selectedCount > 1 ? "s" : ""}
                <span className="font-normal text-zinc-500">
                  {" "}
                  · {formatDateShort(lo)}
                  {hi !== lo ? ` – ${formatDateShort(hi)}` : ""}
                </span>
              </p>
              <input
                className={cn(inputStyles, "py-2 text-sm sm:max-w-xs")}
                placeholder="Reason (optional, private)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                aria-label="Reason for closing"
              />
              <div className="flex gap-2 sm:ml-auto">
                <Button size="sm" variant="dark" onClick={() => apply(true)} loading={pending}>
                  <Lock className="size-3.5" aria-hidden /> Close
                </Button>
                <Button size="sm" variant="outline" onClick={() => apply(false)} disabled={pending}>
                  <LockOpen className="size-3.5" aria-hidden /> Open
                </Button>
                <Button size="sm" variant="ghost" onClick={clear} aria-label="Clear selection">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.p
            role="status"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              "fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-float lg:bottom-8",
              toast.ok ? "bg-ink text-white dark:bg-paper dark:text-ink" : "bg-red-600 text-white",
            )}
          >
            {toast.text}
          </motion.p>
        )}
      </AnimatePresence>

      <p className="mt-4 text-xs text-zinc-500">
        Weeknights {formatMoney(rates.weekday, rates.currency)} · weekend nights {formatMoney(rates.weekend, rates.currency)}. Change rates in Settings.
      </p>
    </div>
  );
}
