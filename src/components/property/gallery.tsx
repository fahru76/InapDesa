"use client";

import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Grid2x2, Images, MapPin, Pause, Play, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/components/i18n/locale";
import { AwanDivider, RebungBand } from "@/components/ui/ornament";
import type { HeroLayout } from "@/lib/content";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
}

const noopSubscribe = () => () => {};

export interface HeroInfo {
  tagline: string | null;
  location: string;
  logoUrl: string | null;
}

export function Gallery({ images, title, layout = "mosaic", hero }: { images: GalleryImage[]; title: string; layout?: HeroLayout; hero?: HeroInfo }) {
  const t = useT();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [mobileIndex, setMobileIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const cover = images[0];

  const onScroll = () => {
    const el = scroller.current;
    if (el) setMobileIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const showAll = images.length > 0 && (
    <button
      type="button"
      onClick={() => setLightbox(0)}
      className="glass absolute right-4 bottom-4 z-10 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-ink shadow-soft transition hover:shadow-float dark:text-white"
    >
      <Grid2x2 className="size-4" aria-hidden />
      {t("gallery.showAll", { n: images.length })}
    </button>
  );

  // ── Grand: full-viewport cover, slow drift (pausable), centred serif title ──
  if (layout === "grand") {
    return (
      <>
        <GrandHero images={images} title={title} hero={hero} onOpen={() => images.length && setLightbox(0)} />
        <Lightbox images={images} index={lightbox} onIndex={setLightbox} title={title} />
      </>
    );
  }

  // ── Cinematic: full-bleed cover with the title overlaid ──
  if (layout === "cinematic") {
    return (
      <>
        <div className="relative -mx-4 overflow-hidden sm:mx-0 sm:rounded-3xl">
          <div className="relative aspect-[4/5] sm:aspect-[21/9]">
            {cover ? (
              <Image src={cover.url} alt={cover.alt || title} fill priority sizes="100vw" className="object-cover" />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-brand-900 via-ink to-zinc-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">
              {hero?.logoUrl && (
                <div className="relative mb-4 size-14 overflow-hidden rounded-2xl bg-white/90 ring-1 ring-white/40">
                  <Image src={hero.logoUrl} alt="" fill sizes="56px" className="object-contain p-1.5" />
                </div>
              )}
              <h1 className="display max-w-3xl text-4xl text-balance sm:text-6xl">{title}</h1>
              {hero?.tagline && <p className="mt-3 max-w-2xl font-display text-xl text-white/85 italic sm:text-2xl">{hero.tagline}</p>}
              {hero?.location && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-white/80">
                  <MapPin className="size-4" aria-hidden /> {hero.location}
                </p>
              )}
            </div>
            {showAll}
            {!cover && <span className="absolute top-4 right-4 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 backdrop-blur">{t("gallery.comingSoon")}</span>}
          </div>
        </div>
        <Lightbox images={images} index={lightbox} onIndex={setLightbox} title={title} />
      </>
    );
  }

  // ── Split: cover beside title, tagline and thumbnails ──
  if (layout === "split") {
    return (
      <>
        <div className="grid items-center gap-6 lg:grid-cols-[1.25fr_1fr] lg:gap-12">
          <button
            type="button"
            onClick={() => images.length && setLightbox(0)}
            className="group relative aspect-[4/3] overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-ink to-zinc-900"
            aria-label={images.length ? t("gallery.open", { n: 1 }) : t("gallery.comingSoon")}
          >
            {cover && (
              <Image
                src={cover.url}
                alt={cover.alt || title}
                fill
                priority
                sizes="(min-width: 1024px) 55vw, 100vw"
                className="object-cover transition duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]"
              />
            )}
            {!cover && (
              <span className="absolute inset-0 grid place-items-center text-sm text-white/70">
                <span className="flex flex-col items-center gap-2">
                  <Images className="size-7" aria-hidden />
                  {t("gallery.comingSoon")}
                </span>
              </span>
            )}
          </button>
          <div>
            {hero?.logoUrl && (
              <div className="relative mb-5 size-16 overflow-hidden rounded-2xl bg-paper ring-1 ring-zinc-200/80 dark:ring-zinc-800">
                <Image src={hero.logoUrl} alt="" fill sizes="64px" className="object-contain p-2" />
              </div>
            )}
            <h1 className="display text-4xl text-balance sm:text-5xl">{title}</h1>
            {hero?.tagline && <p className="mt-4 font-display text-xl leading-8 text-zinc-600 italic sm:text-2xl dark:text-zinc-400">{hero.tagline}</p>}
            {hero?.location && (
              <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                <MapPin className="size-4" aria-hidden /> {hero.location}
              </p>
            )}
            {images.length > 1 && (
              <div className="mt-6 flex gap-2">
                {images.slice(1, 5).map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setLightbox(i + 1)}
                    className="relative aspect-square w-1/4 max-w-24 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-900"
                    aria-label={t("gallery.open", { n: i + 2 })}
                  >
                    <Image src={img.url} alt={img.alt || ""} fill sizes="96px" className="object-cover" />
                    {i === 3 && images.length > 5 && (
                      <span className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-semibold text-white">+{images.length - 5}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <Lightbox images={images} index={lightbox} onIndex={setLightbox} title={title} />
      </>
    );
  }

  // ── Mosaic (default) ──
  if (images.length === 0) {
    return (
      <div className="relative grid aspect-[16/9] place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-ink to-zinc-900 text-white sm:aspect-[21/9]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(249_115_22/0.25),transparent_45%),radial-gradient(circle_at_80%_70%,rgb(16_185_129/0.25),transparent_45%)]" />
        <div className="relative text-center">
          <Images className="mx-auto size-8 opacity-80" aria-hidden />
          <p className="display mt-3 text-3xl">{title}</p>
          <p className="mt-1 text-sm text-white/70">{t("gallery.comingSoon")}</p>
        </div>
      </div>
    );
  }

  const grid = images.slice(0, 5);

  return (
    <>
      {/* Mobile: swipeable carousel */}
      <div className="relative -mx-4 sm:hidden">
        <div ref={scroller} onScroll={onScroll} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto">
          {images.map((img, i) => (
            <button key={img.id} type="button" onClick={() => setLightbox(i)} className="relative aspect-[4/3] w-full shrink-0 snap-center" aria-label={t("gallery.open", { n: i + 1 })}>
              <Image src={img.url} alt={img.alt || `${title} ${i + 1}`} fill sizes="100vw" className="object-cover" priority={i === 0} />
            </button>
          ))}
        </div>
        <span className="glass absolute right-4 bottom-4 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
          {mobileIndex + 1} / {images.length}
        </span>
      </div>

      {/* Desktop: bento grid */}
      <div
        className={cn(
          "relative hidden gap-2 overflow-hidden rounded-3xl sm:grid sm:aspect-[2/1] lg:aspect-[21/9]",
          grid.length >= 5 ? "grid-cols-4 grid-rows-2" : grid.length >= 3 ? "grid-cols-3 grid-rows-2" : grid.length === 2 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {grid.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setLightbox(i)}
            aria-label={t("gallery.open", { n: i + 1 })}
            className={cn("group relative overflow-hidden bg-zinc-100 dark:bg-zinc-900", i === 0 && grid.length >= 3 && "col-span-2 row-span-2")}
          >
            <Image
              src={img.url}
              alt={img.alt || `${title} ${i + 1}`}
              fill
              sizes={i === 0 ? "(min-width: 1024px) 50vw, 66vw" : "25vw"}
              className="object-cover transition duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
              priority={i === 0}
            />
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </button>
        ))}
        {showAll}
      </div>

      <Lightbox images={images} index={lightbox} onIndex={setLightbox} title={title} />
    </>
  );
}

function GrandHero({ images, title, hero, onOpen }: { images: GalleryImage[]; title: string; hero?: HeroInfo; onOpen: () => void }) {
  const t = useT();
  const [paused, setPaused] = useState(false);
  const cover = images[0];

  return (
    <section className="grain relative isolate flex min-h-[78svh] items-end overflow-hidden bg-teak-900 text-ivory sm:min-h-[88svh]" aria-label={title}>
      {cover ? (
        <Image
          src={cover.url}
          alt={cover.alt || title}
          fill
          priority
          sizes="100vw"
          className={cn("animate-drift object-cover", paused && "[animation-play-state:paused]")}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_25%_15%,rgb(176_141_87/0.28),transparent_60%),radial-gradient(50rem_40rem_at_85%_90%,color-mix(in_oklab,var(--color-brand-700)_55%,transparent),transparent_60%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-teak-950/90 via-teak-950/35 to-teak-950/45" />
      <RebungBand className="absolute inset-x-0 top-0 text-brass-light/25" />

      <div className="relative mx-auto w-full max-w-5xl px-6 pt-28 pb-24 text-center sm:pb-28">
        {hero?.logoUrl && (
          <div className="relative mx-auto mb-6 size-16 overflow-hidden rounded-2xl bg-paper/95 ring-1 ring-brass/40">
            <Image src={hero.logoUrl} alt="" fill sizes="64px" className="object-contain p-2" />
          </div>
        )}
        {hero?.location && (
          <p className="eyebrow inline-flex items-center gap-2 text-brass-light">
            <MapPin className="size-3.5" aria-hidden /> {hero.location}
          </p>
        )}
        <h1 className="display mx-auto mt-5 max-w-4xl text-5xl text-balance text-ivory sm:text-7xl lg:text-[5.6rem]">{title}</h1>
        <AwanDivider className="mx-auto mt-6 text-brass-light/90" />
        {hero?.tagline && <p className="mx-auto mt-5 max-w-2xl font-display text-xl text-ivory/85 italic sm:text-2xl">{hero.tagline}</p>}
        {!cover && <p className="mt-6 text-xs tracking-wide text-ivory/50">{t("gallery.comingSoon")}</p>}
      </div>

      <a
        href="#the-house"
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-[11px] font-semibold tracking-[0.2em] text-ivory/70 uppercase transition hover:text-ivory sm:flex lg:hidden"
      >
        {t("hero.discover")}
        <ChevronDown className="size-4" aria-hidden />
      </a>

      <div className="absolute right-4 bottom-4 z-10 flex gap-2 sm:right-6 sm:bottom-6">
        {cover && (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            aria-label={paused ? t("hero.play") : t("hero.pause")}
            title={paused ? t("hero.play") : t("hero.pause")}
            className="grid size-10 place-items-center rounded-full border border-ivory/25 bg-teak-950/40 text-ivory backdrop-blur transition hover:bg-teak-950/60"
          >
            {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
          </button>
        )}
        {images.length > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-ivory/25 bg-teak-950/40 px-4 text-sm font-semibold text-ivory backdrop-blur transition hover:bg-teak-950/60"
          >
            <Grid2x2 className="size-4" aria-hidden />
            {t("gallery.showAll", { n: images.length })}
          </button>
        )}
      </div>
    </section>
  );
}

function Lightbox({ images, index, onIndex, title }: { images: GalleryImage[]; index: number | null; onIndex: (i: number | null) => void; title: string }) {
  const t = useT();
  const [direction, setDirection] = useState(1);
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const open = index !== null;

  const go = useCallback(
    (delta: number) => {
      if (index === null) return;
      setDirection(delta);
      onIndex((index + delta + images.length) % images.length);
    },
    [index, images.length, onIndex],
  );

  useEffect(() => {
    if (!open) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onIndex(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, go, onIndex]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -80) go(1);
    else if (info.offset.x > 80) go(-1);
  };

  if (!mounted) return null;
  const current = index !== null ? images[index] : undefined;

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photos`}
          className="fixed inset-0 z-[60] flex flex-col bg-zinc-950/95 text-white backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex items-center justify-between px-4 py-3 sm:px-6">
            <span className="text-sm font-medium tabular-nums text-white/80">
              {(index ?? 0) + 1} / {images.length}
            </span>
            <button type="button" onClick={() => onIndex(null)} className="grid size-10 place-items-center rounded-full transition hover:bg-white/10" aria-label={t("gallery.close")}>
              <X className="size-5" />
            </button>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <AnimatePresence initial={false} custom={direction} mode="popLayout">
              <motion.div
                key={current.id}
                initial={{ x: direction * 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -80, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.4}
                onDragEnd={onDragEnd}
                className="absolute inset-0 px-2 sm:px-20"
              >
                <Image src={current.url} alt={current.alt || title} fill sizes="100vw" className="pointer-events-none object-contain" priority />
              </motion.div>
            </AnimatePresence>

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  className="absolute top-1/2 left-4 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20 sm:grid"
                  aria-label={t("gallery.prev")}
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  className="absolute top-1/2 right-4 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 backdrop-blur transition hover:bg-white/20 sm:grid"
                  aria-label={t("gallery.next")}
                >
                  <ChevronRight className="size-5" />
                </button>
              </>
            )}
          </div>

          {current.alt && <p className="px-6 pt-3 text-center text-sm text-white/70">{current.alt}</p>}

          <div className="scrollbar-none flex justify-center gap-2 overflow-x-auto px-4 py-4">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => {
                  setDirection(i > (index ?? 0) ? 1 : -1);
                  onIndex(i);
                }}
                className={cn("relative size-14 shrink-0 overflow-hidden rounded-lg transition", i === index ? "ring-2 ring-white" : "opacity-50 hover:opacity-100")}
                aria-label={t("gallery.open", { n: i + 1 })}
                aria-current={i === index}
              >
                <Image src={img.url} alt="" fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
