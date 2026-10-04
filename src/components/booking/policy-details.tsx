import { CalendarX2, ShieldCheck } from "lucide-react";
import { refundSchedule, zonedTimeToUtc, type CancellationPreset, type PaidSplit } from "@/lib/cancellation";
import type { Locale } from "@/lib/content";
import { formatDateLong, formatTime } from "@/lib/dates";
import { makeT, type MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** One-line description of a preset (no dates), e.g. on the listing page. Null for custom text. */
export function policySummary(preset: CancellationPreset, locale: Locale): string | null {
  if (preset === "custom") return null;
  return makeT(locale)(`pol.summary.${preset}` as MessageKey);
}

/**
 * Dated refund timeline with amounts. Falls back to the owner's free text for "custom".
 * Pure (no hooks): works in server components, checkout and the booking pass.
 */
export function CancellationSchedule({
  preset,
  checkIn,
  checkInTime,
  paid,
  currency,
  locale,
  customText,
  timeZone,
  now,
  className,
}: {
  preset: CancellationPreset;
  /** With `now` (ms, from the server request), deadlines already past are shown as passed. */
  timeZone?: string;
  now?: number;
  checkIn: string;
  checkInTime: string;
  paid: PaidSplit;
  currency: string;
  locale: Locale;
  customText?: string | null;
  className?: string;
}) {
  const t = makeT(locale);
  const steps = refundSchedule(preset, checkIn, checkInTime, paid);
  const passed = (s: (typeof steps)[number]) =>
    !!(timeZone && now !== undefined && s.until && zonedTimeToUtc(s.until.date, s.until.time, timeZone).getTime() < now);
  return (
    <div className={className}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <CalendarX2 className="size-4 text-brass-ink dark:text-brass-light" aria-hidden /> {t("pol.title")}
      </p>
      {steps.length === 0 ? (
        customText ? <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{customText}</p> : null
      ) : (
        <>
          <ol className="mt-3 space-y-0">
            {steps.map((s, i) => (
              <li key={i} className={cn("relative flex gap-3 pb-3 last:pb-0", passed(s) && "opacity-55")}>
                <span
                  className={cn(
                    "relative z-10 mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-paper dark:ring-zinc-900",
                    s.percent === 100 ? "bg-brand-600" : s.percent > 0 ? "bg-brass" : "bg-zinc-300 dark:bg-zinc-600",
                  )}
                  aria-hidden
                />
                {i < steps.length - 1 && <span className="absolute top-3 left-[4.5px] h-full w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />}
                <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">
                    <span className={cn(passed(s) && "line-through")}>
                      {s.until ? t("pol.until", { date: `${formatDateLong(s.until.date, locale)}, ${formatTime(s.until.time, locale)}` }) : t("pol.after")}
                    </span>
                    {passed(s) && <span className="ml-1.5 text-xs font-semibold no-underline">· {t("pol.passed")}</span>}
                    <span className="block text-xs text-zinc-500">{s.percent > 0 ? t("pol.refundPct", { pct: s.percent }) : t("pol.noRefund")}</span>
                  </span>
                  <span className={cn("font-semibold tabular-nums", s.refund === 0 && "text-zinc-500")}>{t("pol.refund", { amount: formatMoney(s.refund, currency) })}</span>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5 text-zinc-500">
            {paid.extrasPaid > 0 ? `${t("pol.extrasBack")} ` : ""}
            {t("pol.howToCancel")}
          </p>
        </>
      )}
    </div>
  );
}

/** How the security deposit works for this stay, plus its return status once the host records it. */
export function DepositNote({
  amount,
  days,
  collectedNow,
  currency,
  locale,
  status,
  className,
}: {
  amount: number;
  days: number;
  collectedNow: boolean;
  currency: string;
  locale: Locale;
  status?: { returned: number | null; at: string | null; note: string | null } | null;
  className?: string;
}) {
  if (amount <= 0) return null;
  const t = makeT(locale);
  const money = formatMoney(amount, currency);
  return (
    <div className={className}>
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="size-4 text-brass-ink dark:text-brass-light" aria-hidden /> {t("dep.title")}
      </p>
      {status?.at ? (
        <p className="mt-2 text-sm text-brand-700 dark:text-brand-300">
          {status.returned !== null && status.returned < amount
            ? t("dep.status.partial", { amount: formatMoney(status.returned, currency), total: money, date: formatDateLong(status.at.slice(0, 10), locale) })
            : t("dep.status.returned", { amount: formatMoney(status.returned ?? amount, currency), date: formatDateLong(status.at.slice(0, 10), locale) })}
          {status.note ? <span className="block text-zinc-600 dark:text-zinc-400">&ldquo;{status.note}&rdquo;</span> : null}
        </p>
      ) : (
        <div className="mt-2 space-y-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          <p>{collectedNow ? t("dep.paidNow", { amount: money }) : t("dep.atCheckIn", { amount: money })}</p>
          <p>{days === 0 ? t("dep.returnSameDay") : t("dep.return", { n: days })}</p>
          <p className="text-xs text-zinc-500">{t("dep.examples")}</p>
        </div>
      )}
    </div>
  );
}
