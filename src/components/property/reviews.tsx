import { BadgeCheck, Star } from "lucide-react";
import type { Locale } from "@/lib/content";
import { intlLocale, makeT } from "@/lib/i18n";
import type { PublicReview } from "@/lib/reviews";
import { cn } from "@/lib/utils";

export function Stars({ value, className, label }: { value: number; className?: string; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-3.5", i <= Math.round(value) ? "fill-brass text-brass" : "text-zinc-300 dark:text-zinc-600")} aria-hidden />
      ))}
    </span>
  );
}

function monthLabel(isoMonth: string, locale: Locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoMonth}T00:00:00Z`));
}

/** Review cards. Every review comes from a paid booking whose stay ended, so all are marked as verified stays. */
export function ReviewList({ items, locale, hostName }: { items: PublicReview[]; locale: Locale; hostName: string | null }) {
  const t = makeT(locale);
  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {items.map((r) => (
        <li key={r.id} className="card flex flex-col p-5">
          <div className="flex items-center justify-between gap-3">
            <Stars value={r.rating} label={t("rv.stars", { n: r.rating })} />
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              <BadgeCheck className="size-3.5" aria-hidden /> {t("rv.verified")}
            </span>
          </div>
          <p className="mt-3 text-[15px] leading-7 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{r.body}</p>
          <p className="mt-3 text-sm font-semibold">
            {r.guest_display_name} <span className="font-normal text-zinc-500">· {t("rv.stayed", { month: monthLabel(r.stay_month, locale) })}</span>
          </p>
          {r.host_reply && (
            <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800/60">
              <p className="text-xs font-semibold text-zinc-500">{t("rv.hostReply", { name: hostName ?? t("rv.host") })}</p>
              <p className="mt-1 leading-6 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{r.host_reply}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
