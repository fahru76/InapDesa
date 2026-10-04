import { ArrowLeft, CalendarDays, CircleAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CancellationSchedule, DepositNote } from "@/components/booking/policy-details";
import { PriceBreakdown } from "@/components/booking/price-breakdown";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { buttonStyles } from "@/components/ui/button";
import { getWalletOptions } from "@/lib/billplz";
import { billplzAvailableFor } from "@/lib/booking-service";
import { isCancellationPreset, splitDueNow } from "@/lib/cancellation";
import { localizeProperty } from "@/lib/content";
import { ListingTheme } from "@/components/site/listing-theme";
import { formatDateLong } from "@/lib/dates";
import { getT } from "@/lib/i18n-server";
import { formatMoney, guestErrorMessage, guestSummary, quoteStay, stayErrorMessage, validateStay } from "@/lib/pricing";
import { getAvailability, getPropertyBySlug } from "@/lib/queries";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("co.metaTitle"), robots: { index: false } };
}

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const int = (v: string | string[] | undefined, fallback: number) => {
  const n = Number(one(v));
  return one(v) !== "" && Number.isInteger(n) ? n : fallback;
};

export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ slug }, sp, t] = await Promise.all([params, searchParams, getT()]);
  const locale = t.locale;
  const property = await getPropertyBySlug(slug);
  if (!property || !property.is_published) notFound();

  const checkIn = one(sp.checkIn);
  const checkOut = one(sp.checkOut);
  const guests = { adults: int(sp.adults, 1), children: int(sp.children, 0), infants: int(sp.infants, 0) };

  const availability = await getAvailability(property);
  const unavailable = new Set([...availability.booked, ...availability.blocked]);
  const stayError = validateStay(property, checkIn, checkOut, availability.from, unavailable);
  const guestError = guestErrorMessage(property, guests, locale);
  const backHref = `/stays/${property.slug}`;

  if (stayError || guestError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-terracotta-500/10 text-terracotta-600">
          <CircleAlert className="size-6" aria-hidden />
        </div>
        <h1 className="display mt-5 text-3xl">{t("co.adjust")}</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">{stayError ? stayErrorMessage(stayError, property, locale) : guestError}</p>
        <Link href={backHref} className={buttonStyles({ className: "mt-8" })}>
          {t("co.chooseDates")}
        </Link>
      </div>
    );
  }

  const foreignGuest = property.tourism_tax_enabled && one(sp.foreign) === "1";
  const quote = quoteStay(property, checkIn, checkOut, { foreignGuest });
  const preset = isCancellationPreset(property.cancellation_preset) ? property.cancellation_preset : "custom";
  const cover = property.images[0];
  const text = localizeProperty(property, locale);
  const wallets = billplzAvailableFor(property) ? await getWalletOptions() : null;
  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || null;
  const query = new URLSearchParams({ checkIn, checkOut, adults: String(guests.adults), children: String(guests.children), infants: String(guests.infants) });

  return (
    <div className="surface-muted min-h-[calc(100dvh-4rem)]">
      <ListingTheme accent={property.accent_color} preset={property.theme_preset} />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Link href={`${backHref}?${query}`} className="inline-flex items-center gap-2 text-sm font-medium text-zinc-600 hover:text-ink dark:text-zinc-400 dark:hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> {t("co.back")}
        </Link>
        <h1 className="display mt-4 text-4xl sm:text-5xl">{t("co.title")}</h1>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-12">
          <div className="card order-2 p-6 sm:p-8 lg:order-1">
            <CheckoutFlow
              stripePublishableKey={stripeKey}
              propertyId={property.id}
              propertySlug={property.slug}
              checkIn={checkIn}
              checkOut={checkOut}
              adults={guests.adults}
              childGuests={guests.children}
              infants={guests.infants}
              dueNow={quote.dueNow}
              currency={quote.currency}
              isFullPayment={quote.balanceDue === 0}
              wallets={wallets}
              foreignGuest={foreignGuest}
              tourismTaxRate={property.tourism_tax_enabled ? formatMoney(property.tourism_tax_rate, property.currency) : null}
            />
          </div>

          <aside className="order-1 lg:order-2">
            <div className="card p-6 lg:sticky lg:top-24">
              <div className="flex gap-4">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-800 to-ink">
                  {cover && <Image src={cover.url} alt={cover.alt || text.title} fill sizes="96px" className="object-cover" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{property.city}</p>
                  <p className="mt-1 font-semibold leading-snug tracking-tight">{text.title}</p>
                </div>
              </div>

              <dl className="mt-6 space-y-3 border-y border-zinc-200/80 py-5 text-sm dark:border-zinc-800/80">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 size-4 text-zinc-400" aria-hidden />
                  <div>
                    <dt className="sr-only">Dates</dt>
                    <dd className="font-medium">
                      {formatDateLong(checkIn, locale)} → {formatDateLong(checkOut, locale)}
                    </dd>
                    <dd className="text-zinc-500">
                      {t.plural("co.nights", quote.nights)}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 size-4 text-zinc-400" aria-hidden />
                  <div>
                    <dt className="sr-only">Guests</dt>
                    <dd className="font-medium">{guestSummary(guests, locale)}</dd>
                  </div>
                </div>
              </dl>

              <PriceBreakdown quote={quote} className="mt-5" locale={locale} />

              <CancellationSchedule
                className="mt-6 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80"
                preset={preset}
                checkIn={checkIn}
                checkInTime={property.check_in_time}
                paid={splitDueNow(quote)}
                currency={quote.currency}
                locale={locale}
                customText={text.cancellation_policy}
              />
              <DepositNote
                className="mt-5 border-t border-zinc-200/80 pt-5 dark:border-zinc-800/80"
                amount={quote.securityDeposit}
                days={property.security_deposit_return_days}
                collectedNow={quote.policy === "full"}
                currency={quote.currency}
                locale={locale}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
