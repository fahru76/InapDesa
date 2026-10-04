"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Tables } from "@/lib/database.types";
import { isISODate, type ISODate } from "@/lib/dates";
import {
  formatMoney,
  nightlyRate,
  guestErrorMessage,
  quoteStay,
  stayErrorMessage,
  toMajor,
  validateStay,
  type GuestCounts,
  type Quote,
} from "@/lib/pricing";
import { useT } from "@/components/i18n/locale";
import type { DateRange, NightPrice } from "./date-range-calendar";

export type BookingProperty = Pick<
  Tables<"properties">,
  | "id"
  | "slug"
  | "title"
  | "currency"
  | "weekday_rate"
  | "weekend_rate"
  | "weekend_days"
  | "cleaning_fee"
  | "security_deposit"
  | "min_nights"
  | "max_nights"
  | "payment_policy"
  | "deposit_percent"
  | "max_guests"
  | "max_infants"
>;

interface BookingContextValue {
  property: BookingProperty;
  today: ISODate;
  maxDate: ISODate;
  unavailable: ReadonlySet<ISODate>;
  blocked: ReadonlySet<ISODate>;
  range: DateRange;
  setRange: (range: DateRange) => void;
  clearDates: () => void;
  guests: GuestCounts;
  setGuests: (g: GuestCounts) => void;
  quote: Quote | null;
  stayError: string | null;
  guestError: string | null;
  canReserve: boolean;
  checkoutHref: string | null;
  priceFor: (night: ISODate) => NightPrice;
  fromPrice: number;
}

const BookingContext = createContext<BookingContextValue | null>(null);

interface BookingProviderProps {
  property: BookingProperty;
  today: ISODate;
  maxDate: ISODate;
  booked: ISODate[];
  blocked: ISODate[];
  initial?: { checkIn?: string; checkOut?: string; adults?: number; children?: number; infants?: number };
  children: ReactNode;
}

export function BookingProvider({ property, today, maxDate, booked, blocked, initial, children }: BookingProviderProps) {
  const { locale } = useT();
  const unavailable = useMemo(() => new Set([...booked, ...blocked]), [booked, blocked]);
  const blockedSet = useMemo(() => new Set(blocked), [blocked]);

  const [range, setRange] = useState<DateRange>(() => {
    const ci = initial?.checkIn && isISODate(initial.checkIn) ? initial.checkIn : null;
    const co = ci && initial?.checkOut && isISODate(initial.checkOut) && initial.checkOut > ci ? initial.checkOut : null;
    return { checkIn: ci, checkOut: co };
  });
  const [guests, setGuests] = useState<GuestCounts>(() => ({
    adults: Math.max(1, Math.min(initial?.adults ?? 2, property.max_guests)),
    children: Math.max(0, initial?.children ?? 0),
    infants: Math.max(0, initial?.infants ?? 0),
  }));

  const stayError = useMemo(() => {
    if (!range.checkIn || !range.checkOut) return null;
    const err = validateStay(property, range.checkIn, range.checkOut, today, unavailable);
    return err ? stayErrorMessage(err, property, locale) : null;
  }, [property, range, today, unavailable, locale]);

  const guestError = useMemo(() => guestErrorMessage(property, guests, locale), [property, guests, locale]);

  const quote = useMemo(() => {
    if (!range.checkIn || !range.checkOut || stayError) return null;
    return quoteStay(property, range.checkIn, range.checkOut);
  }, [property, range, stayError]);

  const canReserve = !!quote && !guestError;

  const checkoutHref = useMemo(() => {
    if (!canReserve || !range.checkIn || !range.checkOut) return null;
    const qs = new URLSearchParams({
      checkIn: range.checkIn,
      checkOut: range.checkOut,
      adults: String(guests.adults),
      children: String(guests.children),
      infants: String(guests.infants),
    });
    return `/stays/${property.slug}/checkout?${qs.toString()}`;
  }, [canReserve, range, guests, property.slug]);

  const priceFor = useCallback(
    (night: ISODate): NightPrice => {
      const n = nightlyRate(property, night);
      const major = toMajor(n.rate, property.currency);
      return {
        label: major >= 1000 ? `${(major / 1000).toFixed(major % 1000 === 0 ? 0 : 1)}k` : String(Math.round(major)),
        full: formatMoney(n.rate, property.currency),
        weekend: n.weekend,
      };
    },
    [property],
  );

  const clearDates = useCallback(() => setRange({ checkIn: null, checkOut: null }), []);

  const value: BookingContextValue = {
    property,
    today,
    maxDate,
    unavailable,
    blocked: blockedSet,
    range,
    setRange,
    clearDates,
    guests,
    setGuests,
    quote,
    stayError,
    guestError,
    canReserve,
    checkoutHref,
    priceFor,
    fromPrice: Math.min(property.weekday_rate, property.weekend_rate),
  };

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBooking(): BookingContextValue {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}
