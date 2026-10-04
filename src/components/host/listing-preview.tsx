"use client";

import { Images, Lock, MapPin, Monitor, Smartphone } from "lucide-react";
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { ContentSections, EveningBand } from "@/components/property/content-sections";
import { AwanDivider } from "@/components/ui/ornament";
import { accentCss, loc, themeScheme, themeVars, type ContentSection, type HeroLayout, type LText, type Locale, type ThemePreset } from "@/lib/content";
import { cn } from "@/lib/utils";

export interface PreviewData {
  title: LText;
  tagline: LText;
  description: LText;
  accentColor: string;
  heroLayout: HeroLayout;
  themePreset: ThemePreset;
  logoUrl: string | null;
  sections: ContentSection[];
  location: string;
  photos: { url: string; alt: string }[];
}

/** Turn "a:b;c:d" declarations into a React style object (scopes the accent to the preview). */
function cssVars(decls: string): CSSProperties {
  return Object.fromEntries(
    decls
      .split(";")
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        return [d.slice(0, i), d.slice(i + 1)];
      }),
  ) as CSSProperties;
}

export function ListingPreview({ data, locale }: { data: PreviewData; locale: Locale }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const title = loc(data.title, locale) || "Your homestay";
  const tagline = loc(data.tagline, locale);
  const description = loc(data.description, locale);
  const cover = data.photos[0];
  const publicAll = data.sections.filter((s) => s.audience === "public");
  const band = publicAll.find((s) => s.type === "highlights" && s.visible && s.items.some((i) => i.title.en.trim()));
  const publicSections = publicAll.filter((s) => s !== band);
  const guestSections = data.sections.filter((s) => s.audience === "guests" && s.visible);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">Live preview · {locale === "ms" ? "BM" : "EN"}</p>
        <div className="inline-flex rounded-full border border-zinc-200/80 p-0.5 dark:border-zinc-800/80" role="group" aria-label="Preview device">
          {(["desktop", "mobile"] as const).map((d) => {
            const Icon = d === "desktop" ? Monitor : Smartphone;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                aria-pressed={device === d}
                aria-label={d === "desktop" ? "Desktop preview" : "Mobile preview"}
                className={cn("grid size-7 place-items-center rounded-full transition", device === d ? "bg-ink text-white dark:bg-paper dark:text-ink" : "text-zinc-500")}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-zinc-200/80 bg-zinc-100/70 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/60">
        <div
          style={cssVars(`${accentCss(data.accentColor)};${themeVars(data.themePreset)}`)}
          data-scheme={themeScheme(data.themePreset) === "dark" ? "dark" : undefined}
          className={cn(
            "mx-auto overflow-hidden rounded-xl bg-[var(--surface)] text-ink shadow-soft transition-[max-width] duration-300 dark:text-zinc-100",
            device === "mobile" ? "max-w-[380px]" : "max-w-full",
          )}
        >
          {/* Hero */}
          {data.heroLayout === "grand" ? (
            <div className="grain relative isolate flex aspect-[4/3] items-end overflow-hidden bg-teak-900 text-ivory">
              {cover && <Image src={cover.url} alt="" fill sizes="600px" className="object-cover" />}
              <div className="absolute inset-0 bg-gradient-to-t from-teak-950/90 via-teak-950/35 to-teak-950/45" />
              <div className="relative w-full px-5 pb-8 text-center">
                {data.logoUrl && <Logo url={data.logoUrl} className="mx-auto mb-3 bg-paper/95" />}
                <p className="eyebrow text-brass-light">{data.location}</p>
                <p className="display mt-2 text-3xl text-balance text-ivory">{title}</p>
                <AwanDivider className="mx-auto mt-3 w-40 text-brass-light/90" />
                {tagline && <p className="mt-2 font-display text-base text-ivory/85 italic">{tagline}</p>}
              </div>
            </div>
          ) : data.heroLayout === "cinematic" ? (
            <div className="relative aspect-[16/10]">
              {cover ? <Image src={cover.url} alt="" fill sizes="600px" className="object-cover" /> : <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-ink to-zinc-900" />}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                {data.logoUrl && <Logo url={data.logoUrl} className="mb-3 bg-white/90" />}
                <p className="text-2xl font-semibold tracking-tight text-balance">{title}</p>
                {tagline && <p className="mt-1.5 text-sm text-white/85">{tagline}</p>}
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-white/80">
                  <MapPin className="size-3" aria-hidden /> {data.location}
                </p>
              </div>
            </div>
          ) : data.heroLayout === "split" ? (
            <div className={cn("grid gap-4 p-5", device === "desktop" && "grid-cols-[1.2fr_1fr] items-center")}>
              <Cover url={cover?.url} className="aspect-[4/3] rounded-2xl" />
              <div>
                {data.logoUrl && <Logo url={data.logoUrl} className="mb-3 bg-paper ring-1 ring-zinc-200" />}
                <p className="text-2xl font-semibold tracking-tight text-balance">{title}</p>
                {tagline && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{tagline}</p>}
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500">
                  <MapPin className="size-3" aria-hidden /> {data.location}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="mb-4 flex items-start gap-3">
                {data.logoUrl && <Logo url={data.logoUrl} className="bg-paper ring-1 ring-zinc-200" />}
                <div>
                  <p className="text-xl font-semibold tracking-tight text-balance">{title}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">
                    <MapPin className="size-3" aria-hidden /> {data.location}
                  </p>
                </div>
              </div>
              <div className={cn("grid gap-1.5 overflow-hidden rounded-2xl", device === "desktop" ? "aspect-[2/1] grid-cols-4 grid-rows-2" : "aspect-[4/3]")}>
                <Cover url={cover?.url} className={device === "desktop" ? "col-span-2 row-span-2" : "h-full"} />
                {device === "desktop" && [1, 2, 3, 4].map((i) => <Cover key={i} url={data.photos[i]?.url} />)}
              </div>
              {tagline && <p className="mt-4 font-medium tracking-tight">{tagline}</p>}
            </div>
          )}

          <div className="px-5 pb-6">
            {description && (
              <div className="border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80">
                <p className="text-sm leading-6 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{description}</p>
              </div>
            )}
            {band && (
              <div className="-mx-5 mt-6">
                <EveningBand section={band} locale={locale} eyebrow={locale === "ms" ? "Istimewa" : "Signature"} />
              </div>
            )}
            <ContentSections sections={publicSections} locale={locale} variant="preview" />
            <div className="mt-4">
              <span className="inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white">Reserve & pay deposit</span>
            </div>
            {guestSections.length > 0 && (
              <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
                <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                  <Lock className="size-3.5" aria-hidden /> Guests-only — shown on the booking pass after payment
                </p>
                <ContentSections sections={guestSections} locale={locale} variant="preview" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Cover({ url, className }: { url: string | undefined; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden bg-gradient-to-br from-brand-900/90 via-ink to-zinc-900", className)}>
      {url ? (
        <Image src={url} alt="" fill sizes="400px" className="object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-white/50">
          <Images className="size-5" aria-hidden />
        </span>
      )}
    </div>
  );
}

function Logo({ url, className }: { url: string; className?: string }) {
  return (
    <div className={cn("relative size-11 shrink-0 overflow-hidden rounded-xl", className)}>
      <Image src={url} alt="" fill sizes="44px" className="object-contain p-1" />
    </div>
  );
}
