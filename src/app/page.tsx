import { ArrowRight, Images, MapPin, ShieldCheck, Wallet } from "lucide-react";
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
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgb(176_141_87/0.16),transparent_70%)]" />
        <Reveal className="relative mx-auto max-w-4xl px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28 lg:px-8">
          <p className="eyebrow">{t("home.eyebrow")}</p>
          <h1 className="display mt-5 text-5xl text-balance sm:text-6xl lg:text-[5.25rem]">
            {t("home.title.a")} <em className="text-brand-700 dark:text-brand-300">{t("home.title.b")}</em>
          </h1>
          <AwanDivider className="mx-auto mt-8 text-brass/70" />
          <p className="mx-auto mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">{t("home.lead")}</p>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <li className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-brass-ink dark:text-brass-light" aria-hidden /> {t("home.secure")}
            </li>
            <li className="inline-flex items-center gap-2">
              <Wallet className="size-4 text-brass-ink dark:text-brass-light" aria-hidden /> {t("home.methods")}
            </li>
          </ul>
        </Reveal>
      </section>

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8" aria-labelledby="stays-heading">
        <div className="mb-10 flex items-end justify-between gap-4 border-t border-zinc-200/80 pt-10 dark:border-zinc-800/80">
          <h2 id="stays-heading" className="display text-4xl">
            {t("home.ourHomes")}
          </h2>
          <p className="eyebrow hidden sm:block">{t("home.badge")}</p>
        </div>

        {properties.length === 0 ? (
          <div className="card grid place-items-center px-6 py-16 text-center">
            <p className="text-lg font-semibold">{t("home.empty.title")}</p>
            <p className="mt-2 max-w-md text-sm text-zinc-500">{t("home.empty.body")}</p>
            <Link href="/host/settings" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
              {t("home.empty.cta")} <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((p, i) => {
              const cover = p.images[0];
              const text = localizeProperty(p, t.locale);
              return (
                <li key={p.id}>
                  <Link href={`/stays/${p.slug}`} className="group block">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-zinc-100 dark:bg-zinc-900">
                      {cover ? (
                        <Image
                          src={cover.url}
                          alt={cover.alt || text.title}
                          fill
                          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                          className="object-cover transition duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
                          priority={i < 3}
                        />
                      ) : (
                        <div className="grain grid size-full place-items-center bg-[radial-gradient(30rem_20rem_at_30%_20%,rgb(176_141_87/0.3),transparent_60%)] bg-teak-900 text-ivory/70">
                          <Images className="size-7" aria-hidden />
                        </div>
                      )}
                      <span className="glass absolute top-3 left-3 rounded-full px-3 py-1 text-xs font-semibold">
                        {p.payment_policy === "full" ? t("card.payFull") : t("card.deposit", { pct: p.deposit_percent })}
                      </span>
                    </div>
                    <div className="mt-4 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-display text-2xl leading-tight font-semibold text-balance">{text.title}</h3>
                        <p className="mt-0.5 flex items-center gap-1 text-sm text-zinc-500">
                          <MapPin className="size-3.5" aria-hidden /> {p.city}
                          {p.region ? `, ${p.region}` : ""}
                        </p>
                        <p className="mt-0.5 text-sm text-zinc-500">
                          {t("card.guestsBedrooms", { guests: p.max_guests, bedrooms: p.bedrooms })}
                        </p>
                      </div>
                      <p className="shrink-0 text-right">
                        <span className="block font-display text-2xl leading-tight font-semibold">{formatMoney(Math.min(p.weekday_rate, p.weekend_rate), p.currency)}</span>
                        <span className="text-xs text-zinc-500">{t("panel.perNight")}</span>
                      </p>
                    </div>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 group-hover:underline dark:text-brand-300">
                      {t("home.view")} <ArrowRight className="size-3.5" aria-hidden />
                    </span>
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
