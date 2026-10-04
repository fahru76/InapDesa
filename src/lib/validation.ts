import { z } from "zod";
import { isISODate } from "./dates";
import { normalizePhone } from "./utils";

const isoDate = z.string().refine(isISODate, "Use YYYY-MM-DD");
const phone = z
  .string()
  .trim()
  .min(6, "Enter a phone number")
  .transform((v, ctx) => {
    const e164 = normalizePhone(v);
    if (!e164) {
      ctx.addIssue({ code: "custom", message: "Enter a valid phone number with country code" });
      return z.NEVER;
    }
    return e164;
  });

export const guestDetailsSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.email("Enter a valid email").max(200),
  phone,
  specialRequests: z.string().trim().max(1000).optional().default(""),
});

export const createBookingSchema = z.object({
  propertyId: z.uuid(),
  checkIn: isoDate,
  checkOut: isoDate,
  adults: z.number().int().min(1).max(50),
  children: z.number().int().min(0).max(50),
  infants: z.number().int().min(0).max(10),
  guest: guestDetailsSchema,
  provider: z.enum(["stripe", "billplz"]).default("stripe"),
  /** Guest declares they are not a Malaysian citizen/PR (tourism tax applies when the owner enabled it). */
  foreignGuest: z.boolean().default(false),
  /** Billplz gateway code (e.g. "BP-TNG01") to skip Billplz's selection page; omitted = guest picks there. */
  gatewayCode: z
    .string()
    .regex(/^[A-Za-z0-9 _-]{2,60}$/)
    .optional()
    .nullable(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

const uuid = z.uuid();
export const balancePaymentSchema = z.object({
  token: uuid,
  provider: z.enum(["stripe", "billplz"]),
  gatewayCode: z
    .string()
    .regex(/^[A-Za-z0-9 _-]{2,60}$/)
    .optional()
    .nullable(),
});

export const reviewSchema = z.object({
  bookingId: uuid,
  token: uuid,
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(10, "Write at least a sentence (10+ characters).").max(2000),
  displayName: z.string().trim().min(1).max(60),
});

export const feedSchema = z.object({
  propertyId: uuid,
  name: z.string().trim().min(1, "Give it a name, e.g. Airbnb").max(40),
  url: z.string().trim().min(10).max(1000),
});
export type GuestDetailsInput = z.input<typeof guestDetailsSchema>;

// ─── Host property settings (FormData) ─────────────────────────────────────

const money = z.coerce.number().min(0, "Must be 0 or more").max(1_000_000);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

export const SUPPORTED_CURRENCIES = ["MYR", "SGD", "IDR", "THB", "USD"] as const;

export const propertySettingsSchema = z
  .object({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only")
      .min(3)
      .max(60),
    title: z.string().trim().min(3).max(120),
    address_line: optionalText(200),
    city: z.string().trim().min(2).max(80),
    region: optionalText(80),
    country: z.string().trim().min(2).max(80),
    bedrooms: z.coerce.number().int().min(0).max(30),
    beds: z.coerce.number().int().min(0).max(60),
    bathrooms: z.coerce.number().min(0).max(30),
    max_guests: z.coerce.number().int().min(1).max(50),
    max_infants: z.coerce.number().int().min(0).max(10),
    check_in_time: z.string().regex(/^\d{2}:\d{2}$/),
    check_out_time: z.string().regex(/^\d{2}:\d{2}$/),
    currency: z.enum(SUPPORTED_CURRENCIES),
    weekday_rate: money.refine((v) => v > 0, "Rate must be above 0"),
    weekend_rate: money.refine((v) => v > 0, "Rate must be above 0"),
    weekend_days: z.array(z.coerce.number().int().min(1).max(7)).max(7),
    cleaning_fee: money,
    security_deposit: money,
    min_nights: z.coerce.number().int().min(1).max(60),
    max_nights: z.coerce.number().int().min(1).max(365),
    payment_policy: z.enum(["deposit", "full"]),
    deposit_percent: z.coerce.number().int().min(10).max(100),
    amenities: z.array(z.string().regex(/^[a-z_]+$/)).max(40),
    host_phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return null;
        const e164 = normalizePhone(v);
        if (!e164) {
          ctx.addIssue({ code: "custom", message: "Enter a valid WhatsApp number" });
          return z.NEVER;
        }
        return e164;
      }),
    is_published: z.boolean(),
    billplz_enabled: z.boolean(),
    cancellation_preset: z.enum(["flexible", "moderate", "firm", "non_refundable", "custom"]),
    security_deposit_return_days: z.coerce.number().int().min(0).max(30),
    tourism_tax_enabled: z.boolean(),
    tourism_tax_rate: money,
    tourism_tax_rooms: z.coerce.number().int().min(1).max(50),
  })
  .refine((v) => v.max_nights >= v.min_nights, { path: ["max_nights"], message: "Must be at least the minimum stay" });

export type PropertySettingsInput = z.output<typeof propertySettingsSchema>;

/** Collect a FormData into the plain object shape expected by propertySettingsSchema. */
export function propertyFormToObject(form: FormData): Record<string, unknown> {
  const str = (k: string) => String(form.get(k) ?? "");
  return {
    slug: str("slug"),
    title: str("title"),
    address_line: str("address_line"),
    city: str("city"),
    region: str("region"),
    country: str("country") || "Malaysia",
    bedrooms: str("bedrooms"),
    beds: str("beds"),
    bathrooms: str("bathrooms"),
    max_guests: str("max_guests"),
    max_infants: str("max_infants"),
    check_in_time: str("check_in_time").slice(0, 5),
    check_out_time: str("check_out_time").slice(0, 5),
    currency: str("currency") || "MYR",
    weekday_rate: str("weekday_rate"),
    weekend_rate: str("weekend_rate"),
    weekend_days: form.getAll("weekend_days").map(String),
    cleaning_fee: str("cleaning_fee") || "0",
    security_deposit: str("security_deposit") || "0",
    min_nights: str("min_nights"),
    max_nights: str("max_nights"),
    payment_policy: str("payment_policy"),
    deposit_percent: str("deposit_percent") || "50",
    amenities: form.getAll("amenities").map(String),
    host_phone: str("host_phone"),
    is_published: form.get("is_published") === "on",
    billplz_enabled: form.get("billplz_enabled") === "on",
    cancellation_preset: str("cancellation_preset") || "custom",
    security_deposit_return_days: str("security_deposit_return_days") || "3",
    tourism_tax_enabled: form.get("tourism_tax_enabled") === "on",
    tourism_tax_rate: str("tourism_tax_rate") || "10",
    tourism_tax_rooms: str("tourism_tax_rooms") || "1",
  };
}
