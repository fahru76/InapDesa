import { ChevronDown, MapPin } from "lucide-react";
import { AwanDivider } from "@/components/ui/ornament";
import { loc, sectionIcon, type ContentSection, type Locale } from "@/lib/content";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * Renders owner-defined sections. Pure presentational (no hooks), so it works in
 * Server Components, the receipt page and the editor's client-side live preview.
 */
export function ContentSections({
  sections,
  locale,
  variant = "page",
  className,
}: {
  sections: ContentSection[];
  locale: Locale;
  variant?: "page" | "receipt" | "preview";
  className?: string;
}) {
  const visible = sections.filter((s) => s.visible && (s.items.some((i) => i.title.en.trim()) || (s.body && s.body.en.trim())));
  if (visible.length === 0) return null;
  return (
    <div className={className}>
      {visible.map((s) => (
        <section
          key={s.id}
          aria-labelledby={`sec-${s.id}`}
          className={cn(variant === "page" ? "border-t border-zinc-200/80 py-12 dark:border-zinc-800/80" : "py-6")}
        >
          <h2 id={`sec-${s.id}`} className={cn("display mb-6", variant === "preview" ? "text-2xl" : "text-3xl sm:text-[2.4rem]")}>
            {loc(s.title, locale)}
          </h2>
          <SectionBody section={s} locale={locale} compact={variant === "preview"} />
        </section>
      ))}
    </div>
  );
}

function SectionBody({ section: s, locale, compact }: { section: ContentSection; locale: Locale; compact: boolean }) {
  const items = s.items.filter((i) => i.title.en.trim());
  switch (s.type) {
    case "highlights":
      return (
        <ul className={cn("grid gap-4", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
          {items.map((it) => {
            const Icon = sectionIcon(it.icon);
            return (
              <li key={it.id} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full border border-brass/50 text-brass-ink dark:text-brass-light">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-display text-xl leading-tight font-semibold">{loc(it.title, locale)}</p>
                  {it.text.en.trim() && <p className="mt-0.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{loc(it.text, locale)}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      );

    case "services":
      return (
        <div>
          <ul className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
            {items.map((it) => {
              const Icon = sectionIcon(it.icon);
              return (
                <li key={it.id} className="card flex gap-4 p-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-brass/50 text-brass-ink dark:text-brass-light">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-xl leading-tight font-semibold">{loc(it.title, locale)}</p>
                      {it.meta && it.meta.en.trim() && <span className="shrink-0 pt-0.5 text-sm font-semibold text-brand-700 dark:text-brand-300">{loc(it.meta, locale)}</span>}
                    </div>
                    {it.text.en.trim() && <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{loc(it.text, locale)}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-zinc-500">{translate(locale, "svc.onRequest")}</p>
        </div>
      );

    case "experiences":
      return (
        <ul className={cn("grid gap-3", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
          {items.map((it) => (
            <li key={it.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{loc(it.title, locale)}</p>
                {it.meta && it.meta.en.trim() && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    <MapPin className="size-3" aria-hidden />
                    {loc(it.meta, locale)}
                  </span>
                )}
              </div>
              {it.text.en.trim() && <p className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{loc(it.text, locale)}</p>}
            </li>
          ))}
        </ul>
      );

    case "faq":
      return (
        <div className="divide-y divide-zinc-200/80 rounded-2xl border border-zinc-200/80 dark:divide-zinc-800/80 dark:border-zinc-800/80">
          {items.map((it) => (
            <details key={it.id} className="group px-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold">
                {loc(it.title, locale)}
                <ChevronDown className="size-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <p className="pb-4 text-[15px] leading-7 whitespace-pre-line text-zinc-600 dark:text-zinc-400">{loc(it.text, locale)}</p>
            </details>
          ))}
        </div>
      );

    case "house_guide":
      return (
        <dl className={cn("grid gap-3", !compact && "sm:grid-cols-2")}>
          {items.map((it) => (
            <div key={it.id} className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/60">
              <dt className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">{loc(it.title, locale)}</dt>
              <dd className="mt-1 text-[15px] font-medium break-words whitespace-pre-line">{loc(it.text, locale)}</dd>
            </div>
          ))}
        </dl>
      );

    case "text":
      return <p className="text-[15px] leading-7 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{loc(s.body, locale)}</p>;
  }
}

/**
 * Full-bleed dark "evening" band for a highlights section — the signature moment under the hero.
 * Brass on teak is 5.8:1; ivory on teak 16:1.
 */
export function EveningBand({ section, locale, eyebrow }: { section: ContentSection; locale: Locale; eyebrow: string }) {
  const items = section.items.filter((i) => i.title.en.trim());
  if (!section.visible || items.length === 0) return null;
  return (
    <section aria-labelledby={`band-${section.id}`} className="grain relative isolate overflow-hidden bg-teak-900 text-ivory">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_30rem_at_50%_-10%,rgb(176_141_87/0.18),transparent_70%)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-20 text-center sm:px-6 lg:px-8 lg:py-24">
        <p className="eyebrow text-brass-light">{eyebrow}</p>
        <h2 id={`band-${section.id}`} className="display mx-auto mt-3 max-w-3xl text-4xl text-balance text-ivory sm:text-5xl">
          {loc(section.title, locale)}
        </h2>
        <AwanDivider className="mx-auto mt-6 text-brass/80" />
        <ul className={cn("mx-auto mt-12 grid gap-10 text-left sm:grid-cols-2", items.length >= 3 && "lg:grid-cols-3", items.length === 4 && "lg:grid-cols-4")}>
          {items.map((it) => {
            const Icon = sectionIcon(it.icon);
            return (
              <li key={it.id} className="border-t border-brass/30 pt-6">
                <Icon className="size-6 text-brass-light" aria-hidden />
                <p className="mt-4 font-display text-2xl leading-tight font-semibold text-ivory">{loc(it.title, locale)}</p>
                {it.text.en.trim() && <p className="mt-2 text-sm leading-6 text-ivory/70">{loc(it.text, locale)}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
