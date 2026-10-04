import { Bath, BedDouble, Clock, DoorOpen, ExternalLink, MapPin, ShieldCheck, Star, Users } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { BookingProvider } from "@/components/booking/booking-context";
import { BookingPanel } from "@/components/booking/booking-panel";
import { AvailabilitySection, HeroBookingBar, MobileBookingBar } from "@/components/booking/booking-sections";
import { DepositNote, policySummary } from "@/components/booking/policy-details";
import { ContentSections, EveningBand } from "@/components/property/content-sections";
import { Gallery } from "@/components/property/gallery";
import { AmenityList, ExpandableText, HostCard } from "@/components/property/property-sections";
import { ReviewList } from "@/components/property/reviews";
import { AwanDivider } from "@/components/ui/ornament";
import { Reveal } from "@/components/ui/reveal";
import { syncPropertyFeeds } from "@/lib/calendar-sync";
import { isCancellationPreset } from "@/lib/cancellation";
import { isHeroLayout, localizeProperty, parseSections } from "@/lib/content";
import { ListingTheme } from "@/components/site/listing-theme";
import { addDays, formatTime } from "@/lib/dates";
import { getT } from "@/lib/i18n-server";
import { whatsappLink } from "@/lib/messaging";
import { getAvailability, getPropertyBySlug } from "@/lib/queries";
import { getPropertyReviews } from "@/lib/reviews";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const int = (v: string | string[] | undefined) => {
  const raw = one(v);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) ? n : undefined;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [property, t] = await Promise.all([getPropertyBySlug(slug), getT()]);
  if (!property) return { title: "Stay not found" };
  const text = localizeProperty(property, t.locale);
  return {
    title: text.title,
    description: text.tagline ?? text.description.slice(0, 160),
    openGraph: { images: property.images[0] ? [{ url: property.images[0].url }] : undefined },
  };
}

export default async function StayPage({ params, searchParams }: Props) {
  const [{ slug }, sp, t] = await Promise.all([params, searchParams, getT()]);
  const property = await getPropertyBySlug(slug);
  if (!property || !property.is_published) notFound();

  const locale = t.locale;
  const text = localizeProperty(property, locale);
  const sections = parseSections(property.sections).filter((s) => s.audience === "public");
  // The first visible highlights section becomes the full-bleed evening band; the rest render in the column.
  const band = sections.find((s) => s.type === "highlights" && s.visible && s.items.some((i) => i.title.en.trim()));
  const columnSections = sections.filter((s) => s !== band);
  const layout = isHeroLayout(property.hero_layout) ? property.hero_layout : "grand";
  // Refresh imported calendars in the background when they're over 30 minutes old (after the response is sent).
  after(() => syncPropertyFeeds(property.id, { maxAgeMinutes: 30 }).catch(() => undefined));
  const [availability, reviews] = await Promise.all([getAvailability(property), getPropertyReviews(property.id)]);
  const preset = isCancellationPreset(property.cancellation_preset) ? property.cancellation_preset : "custom";
  const location = [property.city, property.region, property.country].filter(Boolean).join(", ");
  const mapsHref =
    property.latitude !== null && property.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const baths = Number(property.bathrooms);
  const gallery = (
    <Gallery
      images={property.images.map((i) => ({ id: i.id, url: i.url, alt: i.alt }))}
      title={text.title}
      layout={layout}
      hero={{ tagline: text.tagline, location, logoUrl: property.logo_url }}
    />
  );

  return (
    <BookingProvider
      property={property}
      today={availability.from}
      maxDate={addDays(availability.to, -1)}
      booked={availability.booked}
      blocked={availability.blocked}
      initial={{ checkIn: one(sp.checkIn), checkOut: one(sp.checkOut), adults: int(sp.adults), children: int(sp.children), infants: int(sp.infants) }}
    >
      {/* Owner's accent re-themes every brand-* token; the theme preset can restore the classic look. */}
      <ListingTheme accent={property.accent_color} preset={property.theme_preset} />

      {layout === "grand" ? (
        <>
          {gallery}
          <HeroBookingBar />
        </>
      ) : (
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
          {layout === "mosaic" && (
            <header className="mb-6 flex items-start gap-4">
              {property.logo_url && (
                <div className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-paper ring-1 ring-zinc-200/80 sm:size-14 dark:ring-zinc-800">
                  <Image src={property.logo_url} alt="" fill sizes="56px" className="object-contain p-1.5" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className="display text-4xl text-balance sm:text-5xl">{text.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline">
                    <MapPin className="size-4" aria-hidden />
                    {location}
                  </a>
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck className="size-4 text-brand-600" aria-hidden />
                    {t("stay.bookDirect")}
                  </span>
                </div>
              </div>
            </header>
          )}
          {gallery}
        </div>
      )}

      {/* The house — editorial introduction */}
      <section id="the-house" aria-labelledby="the-house-heading" className="scroll-mt-20 px-4 pt-16 pb-16 sm:px-6 sm:pt-20 lg:px-8">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">{t("eb.theHouse")}</p>
          <h2 id="the-house-heading" className="display mx-auto mt-3 max-w-2xl text-4xl text-balance sm:text-5xl">
            {text.tagline || text.title}
          </h2>
          <AwanDivider className="mx-auto mt-6 text-brass/70" />
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <Fact icon={Users} label={t("stay.guests", { n: property.max_guests })} />
            <Fact icon={DoorOpen} label={t.plural("stay.bedrooms", property.bedrooms)} />
            <Fact icon={BedDouble} label={t.plural("stay.beds", property.beds)} />
            <Fact icon={Bath} label={t.plural("stay.baths", baths)} />
            {reviews.average !== null && (
              <li>
                <a href="#reviews" className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline">
                  <Star className="size-4 fill-brass text-brass" aria-hidden />
                  {reviews.average.toFixed(1)} · {t.plural("rv.count", reviews.count)}
                </a>
              </li>
            )}
          </ul>
        </Reveal>
        {text.description && (
          <Reveal className="mx-auto mt-10 max-w-2xl" delay={0.1}>
            <ExpandableText text={text.description} editorial />
          </Reveal>
        )}
      </section>

      {band && <EveningBand section={band} locale={locale} eyebrow={t("eb.signature")} />}

      <div className="mx-auto max-w-7xl px-4 pb-32 sm:px-6 lg:px-8 lg:pb-20">
        <div className="mt-6 grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
          <div className="min-w-0">
            <ContentSections sections={columnSections} locale={locale} />

            {property.amenities.length > 0 && (
              <Section eyebrow={t("eb.comforts")} title={t("stay.offers")}>
                <AmenityList amenities={property.amenities} />
              </Section>
            )}

            {reviews.count > 0 && (
              <section id="reviews" className="scroll-mt-24 border-t border-zinc-200/80 py-12 dark:border-zinc-800/80">
                <p className="eyebrow">{t("eb.reviews")}</p>
                <h2 className="display mt-2 mb-6 flex flex-wrap items-baseline gap-x-4 text-3xl sm:text-[2.4rem]">
                  {t("rv.section")}
                  <span className="font-sans text-base font-semibold text-zinc-600 dark:text-zinc-400">
                    ★ {reviews.average?.toFixed(1)} · {t.plural("rv.count", reviews.count)}
                  </span>
                </h2>
                <ReviewList items={reviews.items} locale={locale} hostName={property.host_display_name} />
              </section>
            )}

            <AvailabilitySection />

            <Section eyebrow={t("eb.essentials")} title={t("stay.goodToKnow")}>
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="card p-6">
                  <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
                    <Clock className="size-4 text-brass-ink dark:text-brass-light" aria-hidden /> {t("stay.arrival")}
                  </h3>
                  <dl className="mt-3 space-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                    <div className="flex justify-between gap-3">
                      <dt>{t("stay.checkIn")}</dt>
                      <dd className="font-medium text-ink dark:text-white">{t("stay.from", { time: formatTime(property.check_in_time, locale) })}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>{t("stay.checkOut")}</dt>
                      <dd className="font-medium text-ink dark:text-white">{t("stay.by", { time: formatTime(property.check_out_time, locale) })}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>{t("stay.minStay")}</dt>
                      <dd className="font-medium text-ink dark:text-white">{t.plural("stay.nights", property.min_nights)}</dd>
                    </div>
                  </dl>
                </div>
                <div className="card p-6">
                  <h3 className="flex items-center gap-2 font-display text-xl font-semibold">
                    <ShieldCheck className="size-4 text-brass-ink dark:text-brass-light" aria-hidden /> {t("stay.paymentPolicy")}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {property.payment_policy === "full" ? t("stay.policy.full") : t("stay.policy.deposit", { pct: property.deposit_percent })}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{policySummary(preset, locale) ?? text.cancellation_policy}</p>
                </div>
              </div>
              {property.security_deposit > 0 && (
                <DepositNote
                  className="card mt-6 p-6"
                  amount={property.security_deposit}
                  days={property.security_deposit_return_days}
                  collectedNow={property.payment_policy === "full"}
                  currency={property.currency}
                  locale={locale}
                />
              )}
              {text.house_rules.length > 0 && (
                <ul className="mt-6 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2 dark:text-zinc-300">
                  {text.house_rules.map((rule) => (
                    <li key={rule} className="flex items-start gap-2.5">
                      <span className="mt-[7px] size-1.5 shrink-0 rotate-45 bg-brass" aria-hidden />
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section eyebrow={t("eb.setting")} title={t("stay.where")}>
              <div className="card flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center">
                <div>
                  <p className="font-display text-xl font-semibold">{location}</p>
                  <p className="mt-1 text-sm text-zinc-500">{t("stay.addressAfter")}</p>
                </div>
                <a
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 self-start rounded-full border border-zinc-300/80 px-4 py-2 text-sm font-semibold transition hover:border-brass hover:shadow-soft sm:self-auto dark:border-zinc-700/80"
                >
                  {t("stay.openMaps")} <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </Section>

            {property.host_display_name && (
              <Section eyebrow={t("eb.hosts")} title={t("stay.meetHost")}>
                <HostCard
                  name={property.host_display_name}
                  bio={text.host_bio}
                  avatarUrl={property.host_avatar_url}
                  languages={property.host_languages}
                  hostSince={property.host_since}
                  whatsappHref={property.host_phone ? whatsappLink(property.host_phone, `Hi! I'm interested in staying at ${text.title}.`) : null}
                />
              </Section>
            )}
          </div>

          <aside className="hidden lg:block" id="book">
            <div className="sticky top-24 pt-12">
              <BookingPanel />
            </div>
          </aside>
        </div>
      </div>

      <MobileBookingBar />
    </BookingProvider>
  );
}

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-zinc-200/80 py-12 dark:border-zinc-800/80">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display mt-2 mb-6 text-3xl sm:text-[2.4rem]">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ icon: Icon, label }: { icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <li className="inline-flex items-center gap-2">
      <Icon className="size-4 text-brass-ink dark:text-brass-light" />
      {label}
    </li>
  );
}
