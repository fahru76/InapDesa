/**
 * Environment access with clear failure messages.
 * NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in client bundles.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  }
  return value;
}

export const publicEnv = {
  get siteUrl(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get supabaseUrl(): string {
    return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey(): string {
    return required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
  get stripePublishableKey(): string {
    return required("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  },
};

/** Server-only secrets. Never import this object into a Client Component. */
export const serverEnv = {
  get supabaseSecretKey(): string {
    return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
  },
  get stripeSecretKey(): string {
    return required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
  },
  get stripeWebhookSecret(): string {
    return required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET);
  },
  /** Optional comma-separated list of emails allowed into /host. Empty = any signed-in user. */
  get hostEmailAllowlist(): string[] {
    return (process.env.HOST_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
  },
  /** Optional: Resend API key for guest emails. Empty = emails off (hosts still have WhatsApp templates). */
  get resendApiKey(): string | null {
    return process.env.RESEND_API_KEY?.trim() || null;
  },
  /** Optional: verified sender, e.g. "Teratak Senja <stay@yourdomain.my>". */
  get emailFrom(): string | null {
    return process.env.EMAIL_FROM?.trim() || null;
  },
  /** Optional: shared secret for /api/cron/* (Vercel Cron sends it as a Bearer token). Empty = cron endpoints disabled. */
  get cronSecret(): string | null {
    const v = process.env.CRON_SECRET?.trim();
    return v && v.length >= 16 ? v : null;
  },
  get bookingHoldMinutes(): number {
    const n = Number(process.env.BOOKING_HOLD_MINUTES ?? 15);
    return Number.isFinite(n) && n >= 5 && n <= 120 ? n : 15;
  },
};
