import { ShieldCheck } from "lucide-react";
import type { Locale } from "@/lib/content";
import { makeT } from "@/lib/i18n";
import { formatMoney, type Quote } from "@/lib/pricing";
import { cn } from "@/lib/utils";

interface PriceBreakdownProps {
  quote: Quote;
  className?: string;
  /** Hide the "due today / at check-in" split (e.g. on the receipt where it's shown separately). */
  hideSplit?: boolean;
  locale?: Locale;
}

export function PriceBreakdown({ quote, className, hideSplit, locale = "en" }: PriceBreakdownProps) {
  const t = makeT(locale);
  const m = (n: number) => formatMoney(n, quote.currency);
  const weekdayRate = quote.nightly.find((n) => !n.weekend)?.rate;
  const weekendRate = quote.nightly.find((n) => n.weekend)?.rate;

  return (
    <div className={cn("text-[15px]", className)}>
      <table className="w-full">
        <caption className="sr-only">{t("price.caption")}</caption>
        <tbody className="[&_td]:py-1.5 [&_td:last-child]:text-right [&_td:last-child]:tabular-nums">
          {quote.weekdayNights > 0 && weekdayRate !== undefined && (
            <tr>
              <td className="text-zinc-600 dark:text-zinc-400">
                {t.plural("price.weeknights", quote.weekdayNights, { rate: m(weekdayRate) })}
              </td>
              <td>{m(weekdayRate * quote.weekdayNights)}</td>
            </tr>
          )}
          {quote.weekendNights > 0 && weekendRate !== undefined && (
            <tr>
              <td className="text-zinc-600 dark:text-zinc-400">
                {t.plural("price.weekends", quote.weekendNights, { rate: m(weekendRate) })}
              </td>
              <td>{m(weekendRate * quote.weekendNights)}</td>
            </tr>
          )}
          {quote.cleaningFee > 0 && (
            <tr>
              <td className="text-zinc-600 dark:text-zinc-400">{t("price.cleaning")}</td>
              <td>{m(quote.cleaningFee)}</td>
            </tr>
          )}
          {quote.securityDeposit > 0 && (
            <tr>
              <td className="text-zinc-600 dark:text-zinc-400">
                <span className="inline-flex items-center gap-1.5">
                  {t("price.security")}
                  <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                    {t("price.refundable")}
                  </span>
                </span>
              </td>
              <td>{m(quote.securityDeposit)}</td>
            </tr>
          )}
          {quote.tourismTax > 0 && (
            <tr>
              <td className="text-zinc-600 dark:text-zinc-400">{t("price.tourismTax")}</td>
              <td>{m(quote.tourismTax)}</td>
            </tr>
          )}
          <tr className="border-t border-zinc-200/80 font-semibold dark:border-zinc-800/80 [&_td]:pt-3">
            <td>{t("price.total")}</td>
            <td>{m(quote.total)}</td>
          </tr>
        </tbody>
      </table>

      {!hideSplit && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-brand-200/70 bg-gradient-to-br from-brand-50 to-white dark:border-brand-500/20 dark:from-brand-500/10 dark:to-transparent">
          <div className="flex items-end justify-between gap-3 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">{t("price.dueToday")}</p>
              <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                {quote.policy === "full" ? t("price.lockFull") : t("price.lockDeposit", { pct: quote.depositPercent })}
              </p>
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums text-ink dark:text-white">{m(quote.dueNow)}</p>
          </div>
          {quote.balanceDue > 0 && (
            <div className="flex items-center justify-between border-t border-brand-200/60 bg-white/60 px-4 py-2.5 text-sm dark:border-brand-500/20 dark:bg-transparent">
              <span className="text-zinc-600 dark:text-zinc-400">
                {t("price.dueCheckIn")}
                {quote.securityDeposit > 0 ? t("price.inclDeposit") : ""}
              </span>
              <span className="font-semibold tabular-nums">{m(quote.balanceDue)}</span>
            </div>
          )}
        </div>
      )}

      {!hideSplit && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <ShieldCheck className="size-3.5 text-brand-600" aria-hidden />
          {t("price.secure")}
        </p>
      )}
    </div>
  );
}
