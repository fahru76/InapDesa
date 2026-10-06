import { ArrowRight, CalendarDays, Images, MapPin, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { AwanDivider } from "@/components/ui/ornament";
import { Reveal } from "@/components/ui/reveal";
import { formatMoney } from "@/lib/pricing";
import { localizeProperty } from "@/lib/content";
import { getT } from "@/lib/i18n-server";
import { getPublishedProperties } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [properties, t] = await Promise.all([getPublishedProperties(), getT()]);

  return (
    <div className="pb-20">
      <section className="relative isolate overflow-hidden bg-ink text-ivory">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(42rem_28rem_at_78%_12%,rgb(63_117_89/0.42),transparent_68%)]" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-16 pb-14 sm:px-6 sm:pt-24 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)] lg:items-end lg:px-8 lg:pt-28">
          <Reveal className="relative">
            <p className="eyebrow text-brass-light">{t("home.eyebrow")}</p>
            <h1 className="display mt-5 max-w-3xl text-6xl leading-[0.9] text-balance sm:text-7xl lg:text-[7.25rem]">
              {t("home.title.a")} <em className="text-brand-300">{t("home.title.b")}</em>
            </h1>
            <AwanDivider className="mt-8 max-w-xs text-brass/70" />
            <p className="mt-7 max-w-lg text-base leading-7 text-ivory/70 sm:text-lg">{t("home.lead")}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#stays-heading" className="inline-flex items-center gap-2 rounded-full bg-ivory px-5 py-3 text-sm font-bold text-ink transition hover:bg-white">
                {t("home.ourHomes")} <ArrowRight className="size-4" aria-hidden />
              </a>
              <Link href="/host" className="inline-flex items-center gap-2 rounded-full border border-ivory/25 px-5 py-3 text-sm font-bold text-ivory transition hover:border-ivory/60 hover:bg-white/10">
                <Sparkles className="size-4 text-brass-light" aria-hidden /> {t("nav.host")}
              </Link>
            </div>
          </Reveal>
          <Reveal className="relative lg:pb-3" delay={0.12}>
            <div className="rounded-[2rem] border border-white/15 bg-white/[0.07] p-3 shadow-float backdrop-blur-sm">
              <div className="grid min-h-72 place-items-center overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-brand-900 via-teak-800 to-teak-950 px-8 py-12 text-center">
                <div>
                  <CalendarDays className="mx-auto size-9 text-brass-light" aria-hidden />
                  <p className="mt-5 font-display text-3xl text-ivory">A stay worth remembering.</p>
                  <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-ivory/60">Choose your dates, see the real price, and book directly with the host.</p>
                </div>
              </div>
              <div className="flex items-center justify-between px-3 pt-4 pb-1 text-xs text-ivory/55">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-brand-300" aria-hidden /> {t("home.secure")}</span>
                <span className="inline-flex items-center gap-1.5"><Wallet className="size-3.5 text-brass-light" aria-hidden /> {t("home.methods")}</span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8 lg:pt-24" aria-labelledby="stays-heading">
        <div className="mb-10 grid gap-4 border-b border-zinc-200/80 pb-6 dark:border-zinc-800/80 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="eyebrow">{t("home.badge")}</p>
            <h2 id="stays-heading" className="display mt-2 max-w-xl text-5xl text-balance">{t("home.ourHomes")}</h2>
          </div>
          <p className="max-w-xs text-sm leading-6 text-zinc-500 sm:text-right">Direct stays, thoughtful details, and a booking flow that shows you the truth before you pay.</p>
        </div>

        {properties.length === 0 ? (
          <div className="card grid place-items-center px-6 py-16 text-center"><p className="text-lg font-semibold">{t("home.empty.title")}</p><p className="mt-2 max-w-md text-sm text-zinc-500">{t("home.empty.body")}</p><Link href="/host/settings" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">{t("home.empty.cta")} <ArrowRight className="size-4" aria-hidden /></Link></div>
        ) : (
          <ul className="grid gap-x-7 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p, i) => {
              const cover = p.images[0];
              const text = localizeProperty(p, t.locale);
              return (
                <li key={p.id} className={i === 1 ? "lg:pt-12" : ""}>
                  <Link href={`/stays/${p.slug}`} className="group block">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-zinc-100 dark:bg-zinc-900">
                      {cover ? <Image src={cover.url} alt={cover.alt || text.title} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" priority={i < 3} /> : <div className="grain grid size-full place-items-center bg-teak-900 text-ivory/70"><Images className="size-7" aria-hidden /></div>}
                      <span className="glass absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-semibold">{p.payment_policy === "full" ? t("card.payFull") : t("card.deposit", { pct: p.deposit_percent })}</span>
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="font-display text-2xl leading-tight font-semibold text-balance">{text.title}</h3><p className="mt-1 flex items-center gap-1 text-sm text-zinc-500"><MapPin className="size-3.5" aria-hidden /> {p.city}{p.region ? `, ${p.region}` : ""}</p><p className="mt-1 text-sm text-zinc-500">{t("card.guestsBedrooms", { guests: p.max_guests, bedrooms: p.bedrooms })}</p></div><p className="shrink-0 text-right"><span className="block font-display text-2xl leading-tight font-semibold">{formatMoney(Math.min(p.weekday_rate, p.weekend_rate), p.currency)}</span><span className="text-xs text-zinc-500">{t("panel.perNight")}</span></p></div>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 group-hover:underline dark:text-brand-300">{t("home.view")} <ArrowRight className="size-3.5" aria-hidden /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
