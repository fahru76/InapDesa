# InapDesa — direct homestay booking with advance payments

A booking site for private homestay owners and boutique hosts. Guests pick dates on a live price calendar, pay a deposit (or the full amount) through Stripe, and get a QR check-in pass. Hosts manage availability, payments, check-ins and WhatsApp/SMS guest messages from a dashboard.

**Stack:** Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · Lucide · Supabase (Postgres + RLS + Auth + Storage) · Stripe Payment Element + Express Checkout (cards, Apple Pay, Google Pay, FPX/GrabPay when enabled).

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 20.9+ (22 LTS recommended; `.nvmrc` = 22) | `node -v` |
| npm | 10+ | `npm -v` |
| Supabase project | — | dashboard.supabase.com |
| Stripe account | test mode is fine | dashboard.stripe.com |
| Stripe CLI (optional, local webhooks) | latest | `stripe -v` |

## 2. Install

The GitHub repo is the master copy. Clone it (or, in an existing clone such as `C:\InapDesa`, run `git pull --ff-only origin main`), then:

```bash
git clone https://github.com/fahru76/InapDesa.git
cd InapDesa
npm ci
```

## 3. Environment variables

`.env.local` (git-ignored) already contains your Supabase URL and publishable key. Fill in the rest yourself — **never paste secret keys into chats, tickets or commits**.

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally; your domain in production |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API Keys → Publishable key |
| `SUPABASE_SECRET_KEY` | Supabase → API Keys → Secret key (**server only**) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API keys (`pk_test_…`) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen` output (local) or the webhook endpoint's signing secret (prod) |
| `BOOKING_HOLD_MINUTES` | Minutes unpaid checkouts hold dates (default 15) |
| `HOST_EMAIL_ALLOWLIST` | Comma-separated emails allowed into `/host` (recommended in production) |
| `BILLPLZ_API_KEY` | *Optional, leave empty until your Billplz account is ready.* Billplz → Settings → Keys & Integration → API Secret Key (**server only**) |
| `BILLPLZ_COLLECTION_ID` | Billplz → Billing → your collection's ID |
| `BILLPLZ_X_SIGNATURE_KEY` | Billplz → Settings → Keys & Integration → X Signature Key (enable X Signature) (**server only**) |
| `BILLPLZ_SANDBOX` | `true` → billplz-sandbox.com (default); `false` → live billplz.com |
| `RESEND_API_KEY` | *Optional.* [Resend](https://resend.com) → API Keys. Enables confirmation, arrival and review-invite emails (**server only**) |
| `EMAIL_FROM` | Sender on a domain verified in Resend, e.g. `InapDesa <stay@yourdomain.my>` |
| `CRON_SECRET` | Random string ≥16 chars (e.g. `openssl rand -hex 24`). Protects `/api/cron/daily`; Vercel sends it automatically (**server only**) |

`.env.example` documents the same variables for new environments.

## 4. Database

Migrations live in `supabase/migrations/`:

| File | What it does |
|---|---|
| `20261003000000_inapdesa_init.sql` | Enums, tables (`profiles`, `properties`, `property_images`, `blocked_dates`, `bookings`, `transactions`), double-booking exclusion constraint, RPCs, RLS policies, `property-images` storage bucket |
| `20261003000100_harden_function_exposure.sql` | Moves RLS helper functions to a non-exposed `private` schema; revokes direct execution of the signup trigger |
| `20261004000000_content_branding_billplz.sql` | v2: owner content (`translations`, `sections`, `accent_color`, `logo_url`, `hero_layout`), host-only `property_guest_content` table, Billplz columns on `bookings`, `finalize_billplz_bill` RPC (service role only) |
| `20261005000000_heritage_theme.sql` | v3: `grand` hero layout, `theme_preset` column (`heritage` default / `classic`), new defaults (Grand + jungle accent `#2f5d46`); moves listings still on both old defaults to the new look |
| `20261006000000_trust_sync_policies.sql` | v4: calendar sync (`calendar_feeds`, private export token, `blocked_dates.feed_id`), cancellation presets, security-deposit return tracking, tourism tax, balance-payment columns + `finalize_balance_payment` RPC (service role only), `booking_notifications` (send-once email log), verified `reviews` with host replies |
| `20261007000000_more_themes.sql` | v5: five more listing themes allowed in `properties.theme_preset` (`malam`, `tanah`, `pesisir`, `galeri`, `peranakan`); widening only, existing rows unchanged |
| `supabase/seed.sql` | Demo listing "Teratak Senja" + 3 blocked nights |

> **Status for project `ctbphzkqmyhdcsahlqio`:** all six migrations and the seed have been applied (v1–v4 on 2026‑10‑03, v5 themes on 2026‑10‑04). Skip to step 5.

For a new project, either:

```bash
# Option A — Supabase CLI
npx supabase link --project-ref <your-ref>
npx supabase db push
psql "<connection string>" -f supabase/seed.sql   # optional demo data
```

or paste each file, in order, into **Supabase → SQL Editor** and run it.

To regenerate TypeScript types after schema changes:

```bash
npx supabase gen types typescript --project-id <your-ref> --schema public > src/lib/database.types.ts
```

## 5. Auth (host sign-in)

1. Supabase → **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (your domain in production)
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`
2. Sign in at `/login` with your email (magic link).
3. **Claim the demo property** so it appears in your dashboard (SQL Editor):

   ```sql
   update public.properties
      set host_id = (select id from auth.users where email = 'you@example.com')
    where slug = 'teratak-senja';
   ```

   Or create a new listing from **Host → Settings**.
4. Production: set `HOST_EMAIL_ALLOWLIST` and consider disabling open sign-ups (Authentication → Providers → Email → *Allow new users to sign up* off, after creating your account).

## 6. Stripe

1. Use **test mode** keys while developing.
2. Payment methods: Stripe Dashboard → Settings → Payment methods. Enable Cards, Apple Pay, Google Pay, and for MYR: **FPX** and **GrabPay**. The Payment Element shows whatever is enabled and eligible for the currency.
3. Apple Pay on your production domain: Settings → Payment method domains → add your domain.
4. Local webhooks:

   ```bash
   stripe login
   npm run stripe:listen        # = stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` and restart `npm run dev`.
5. Production webhook: Developers → Webhooks → Add endpoint `https://<your-domain>/api/stripe/webhook` with events:
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`.

Test card: `4242 4242 4242 4242`, any future date, any CVC.

## 6b. Billplz — Malaysian e-wallets & FPX (optional, ready to switch on)

Stripe in Malaysia covers cards, FPX and GrabPay. Billplz adds **Touch 'n Go eWallet, Boost, ShopeePay, GrabPay, DuitNow QR and FPX**. The integration is built in but **stays hidden** until all three conditions are true:

1. `BILLPLZ_API_KEY`, `BILLPLZ_COLLECTION_ID` and `BILLPLZ_X_SIGNATURE_KEY` are set (server restart / redeploy needed),
2. the listing's currency is **MYR**, and
3. the owner ticks **Host → Settings → Payment methods → Malaysian e-wallets & online banking (Billplz)**.

When your Billplz account is approved:

1. Start in sandbox (`BILLPLZ_SANDBOX=true`, keys from billplz-sandbox.com), then switch to live keys and `BILLPLZ_SANDBOX=false`.
2. Enable **X Signature** in Billplz and copy the key into `BILLPLZ_X_SIGNATURE_KEY`.
3. Make sure `NEXT_PUBLIC_SITE_URL` is your public HTTPS URL — Billplz must reach:
   - callback (server-to-server): `{SITE_URL}/api/billplz/callback`
   - redirect (guest's browser): `{SITE_URL}/api/billplz/return`
   Both URLs are sent with each bill; nothing needs to be configured in the Billplz dashboard. Locally, use a tunnel (e.g. `ngrok http 3000`) and set `NEXT_PUBLIC_SITE_URL` to the tunnel URL.
4. Only gateways **activated on your Billplz account** appear as wallet tiles (read from Billplz's `/v4/payment_gateways`, cached 10 min). If none are returned, guests still get "Online banking (FPX)" and choose on Billplz's page.

How it's secured: every callback/redirect is X-Signature-verified **and** the bill is re-fetched from Billplz before anything is recorded; the amount must equal the booking's amount due and currency must be MYR; `finalize_billplz_bill` is idempotent.

Limitations: Billplz has no refund API — refunds for Billplz-paid bookings (host cancellations or a rare hold-expiry conflict) must be done from the Billplz dashboard or by bank transfer. The app tells the host when this is needed and logs conflicts server-side.

## 7. Run

```bash
npm run dev        # http://localhost:3000
npm run verify     # everything below, in order — run before every commit/delivery
npm run typecheck  # TypeScript
npm run lint       # ESLint (eslint-config-next)
npm test           # unit tests (vitest): pricing, dates, cancellation, iCal, themes, logging, Stripe pin
npm run build && npm start
```

`npm run verify` is also what CI runs (`.github/workflows/verify.yml`, placeholder env only, no secrets) once the repo is on GitHub.

### Engineering rules

AI agents (and people) working on this repo follow **`CLAUDE.md`**: start from a failing check, verify in code, never hide a failed check, irreversible actions need approval, secrets never in code/logs. Plans and review notes go in `tasks/todo.md`; lessons from mistakes go in `tasks/lessons.md`.

### Logs

Server code logs through `src/lib/log.ts`: one JSON line per event (`{"ts","level","event",...ids}`), e.g. `stripe-webhook.handled`, `billplz-callback.handled`, `booking.held`, `cron.done` — each with an `outcome` and duration `ms`; failures use `level:"error"`. Personal data (emails, phones, names, tokens) is redacted automatically — still, never pass request bodies. In Vercel → Logs, filter on `"level":"error"` or an event name.

---

## How it works

### Booking flow

1. **Listing** (`/stays/[slug]`): gallery + lightbox, amenities, host card, live availability calendar with nightly weekday/weekend prices. Desktop: sticky booking card. Mobile: bottom bar → drag-to-dismiss bottom sheet.
2. **Checkout** (`/stays/[slug]/checkout`): server re-validates dates and capacity → guest details → `POST /api/bookings`.
3. **Hold** — the server recomputes the price from the database (client prices are never trusted), inserts a `pending_payment` booking with `hold_expires_at`, and creates a Stripe PaymentIntent for the **amount due today**. A Postgres exclusion constraint makes double-booking impossible, even under concurrent checkouts.
4. **Payment** — Stripe Payment Element / Express Checkout, or (when enabled) a Billplz bill for Malaysian e-wallets/FPX — the guest picks a wallet on our page and is sent straight to it. On success the guest returns to `/booking/[id]?token=…`.
5. **Confirmation** — the webhook (or a direct Stripe check from the receipt page if the webhook is late) calls `finalize_booking_payment`, which is idempotent. If a hold lapsed and the dates were taken in the meantime, the booking is cancelled and the payment **refunded automatically**.
6. **Receipt** — QR check-in pass (encodes `/host/check-in/<reference>`), add-to-calendar (.ics), print, WhatsApp the host.

### Advance payment policy (per property, Host → Settings)

| Policy | Due today | Due at check-in |
|---|---|---|
| `deposit` (10–100%) | `round(pct × (nights + cleaning))` | remaining stay charges + refundable security deposit |
| `full` | everything incl. security deposit | 0 |

All money is stored as integer minor units (sen). Weekend nights are configurable (default Fri & Sat nights).

### Host dashboard (`/host`)

- **Overview:** advance payments this month (net of refunds), balance to collect, arrivals, 30-day occupancy, Stripe pending/available balance and upcoming payouts, recent transactions.
- **Calendar:** tap-to-select date ranges → close/open nights. **Sync with Airbnb, Agoda & Booking.com** (see below).
- **Bookings:** filters, guest contact, one-tap **WhatsApp / SMS** with templates (confirmation, arrival details, balance reminder, thank-you), cancel with a refund by policy / full / none (Stripe refunds automatic; Billplz refunds are done manually in Billplz), record the security-deposit return, reply to reviews.
- **Check-in:** scan the guest's QR → record on-site balance → checked in.
- **Content** (`/host/content`): the owner's page editor — title, tagline, story, house rules, cancellation policy and host profile in **English and Bahasa Melayu**; **branding** (theme — 7 choices, see below; logo upload; accent colour with contrast check; hero layout: Grand / Mosaic / Cinematic / Split); **page sections** (Highlights, Nearby & experiences, FAQ, House guide, Text) that can be reordered, hidden, and set to *Everyone* or *Paid guests only*; **live preview** (desktop/mobile) while editing; nothing changes on the public page until **Publish**.
- **Settings:** listing details, rates, policy (with live deposit preview), amenities, WhatsApp number, payment methods, photo upload (Supabase Storage).

### Calendar sync (iCal)

1. **Host → Calendar → Sync**: copy *your InapDesa calendar link* (`/api/ical/<secret>.ics`) and paste it into each platform's "import calendar" setting. It contains dates only — no guest names. *New link* revokes the old one.
2. Paste each platform's **export / iCal link** (https only) under *Import their calendars* → Connect.
3. Imported nights close automatically. They're refreshed by the daily cron, before every new booking (if older than 15 min) and in the background when guests view the listing. *Sync now* is limited to once a minute.
4. Imported nights can't be reopened by hand — remove them on the source platform or disconnect the feed.
5. If an imported night overlaps a paid InapDesa booking, a warning appears. It may be your own InapDesa booking echoed back by the other platform; check before acting.

Platforms refresh imported calendars on their own schedule (often 1–3 hours), so a short double-booking window always exists with iCal.

### Trust & clarity features (v4)

- **Cancellation presets** (Settings): Flexible (full refund until 1 day before), Moderate (7 days), Firm (full until 30 days, 50% until 7 days), Non-refundable, or Custom text. Guests see dated deadlines with refund amounts at checkout and on their booking pass; the policy is snapshotted on each booking. Security deposit and tourism tax are always refunded.
- **Security deposit:** shown with when it's collected and how many days until return; the host records the returned amount (a note is required for partial returns) and the guest sees the status.
- **Tourism tax** (opt-in): flat amount per room per night for guests who tick "not a Malaysian citizen". Default RM10 — **verify current MyTTx rules and whether your property must register** before enabling.
- **Pay balance online:** guests can pay the remaining balance from their booking pass (Stripe, or Billplz when configured).
- **Emails** (needs `RESEND_API_KEY` + `EMAIL_FROM`): confirmation, arrival details 7 days and 1 day before, review invite after check-out, in the guest's language. Each is sent once.
- **Reviews:** only guests with a paid, completed stay can review, once per booking, from their booking pass. Hosts can reply.
- **Daily cron** `/api/cron/daily` (`vercel.json`, 01:00 UTC — Vercel Hobby allows daily crons): releases expired holds, syncs calendars, sends due emails. Needs `CRON_SECRET`.
- Removed the unconditional "verified" badge; checkout shows a pay-safety note instead.

### Design system — "warm heritage editorial"

- **Tokens** live in `src/app/globals.css`: teak ink `#1c1712`, ivory `#f7f2e9`, sand, brass `#b08d57` (decoration on light; text/icons on dark only), `brass-ink` `#7a5f35` for small text on light, warm greys replacing Tailwind's zinc, owner accent (`brand-*`, default jungle green `#2f5d46`).
- **Type:** Cormorant Garamond (display, `display` / `font-display` utilities, self-hosted via Fontsource) + Plus Jakarta Sans (UI/body). Small uppercase labels use the `eyebrow` utility.
- **Ornaments:** original *awan larat* divider and *pucuk rebung* border in `src/components/ui/ornament.tsx` (decorative, `aria-hidden`).
- **Signature pieces:** Grand full-screen hero with slow drift + pause control and a floating booking bar; editorial "The house" intro with drop cap; dark "evening band" built from the first Highlights section; Concierge & extras section type; invitation-style booking pass; teak footer.
- **Owner control:** Host → Content → Branding → **Theme** and **Hero layout** (Grand / Mosaic / Cinematic / Split). Each owner chooses for their own listing; nothing changes for guests until **Publish**.

### Listing themes (v5)

| Theme | Look | Heading font | Suggested accent |
|---|---|---|---|
| Heritage (default) | Ivory and teak, brass details | Cormorant Garamond | `#2f5d46` jungle |
| Malam | Dark luxury, champagne gold, sharp corners — **always dark** | Cormorant Garamond | `#8a6a35` bronze |
| Tanah | Sand, terracotta, olive, soft corners | Lora | `#a4472a` clay |
| Pesisir | Sea-salt white, ocean navy, sand gold | Playfair Display | `#1f4e6e` navy |
| Galeri | White, black ink, square corners | Libre Bodoni | `#111111` ink |
| Peranakan | Jade, coral, marigold on cream | Cinzel (capitals) | `#1f6b5c` jade |
| Classic | Original white, cool grey, all sans | Plus Jakarta Sans | `#059669` emerald |

- Defined in `src/lib/themes.ts`; applied to listing, checkout and booking-pass pages by `ListingTheme` (`src/components/site/listing-theme.tsx`) and to the editor's live preview.
- Picking a theme also switches the accent to the theme's suggestion **unless the owner has chosen their own colour**; then a "Use it" link offers the suggestion instead.
- Light themes follow the guest's light/dark setting with their own dark surfaces. Malam forces dark via a `data-page-scheme="dark"` marker that the `dark:` variant listens to (`@custom-variant` in `globals.css`).
- Fonts are self-hosted (Fontsource). All are declared globally, but a browser downloads only the font the page actually uses.
- Contrast is unit-tested for every theme (`src/lib/themes.test.ts`) and was checked with axe on the listing and checkout pages for every theme (light and dark): 0 issues.
- Add a theme: add it to `THEME_PRESETS`, `THEMES` and `THEME_TOKENS`, import its font in `src/app/layout.tsx`, and widen the `properties_theme_preset_check` constraint with a migration.
- **Accessibility:** automated axe colour-contrast checks pass in light and dark mode; motion respects `prefers-reduced-motion`; scroll reveals keep content visible without JS.

### Languages

Guests switch **EN / BM** in the header (stored in a `locale` cookie; first visit follows the browser language). All guest-facing UI, dates and amounts are localised; owner content falls back to English wherever a Bahasa Melayu field is left empty. The host dashboard is English.

### Guest-only content

Sections marked *Paid guests only* (always for House guide — Wi-Fi, door codes, parking) are stored in `property_guest_content`, which only the host can read via RLS. They're shown on the booking pass once a booking is paid, read server-side with the secret key — never sent to the public listing page.

### Security model

- RLS on every table. Anonymous users can read published listings and images, and availability via `get_unavailable_dates` (dates only, no guest data).
- Bookings/transactions are readable only by the property's host. All writes go through the server (secret key) or `SECURITY DEFINER` RPCs that check ownership.
- Guest receipts require an unguessable `access_token` (UUID) in the URL.
- Stripe webhooks are signature-verified; all handlers are idempotent.
- RLS helper functions live in a non-exposed `private` schema.
- Billplz callbacks are X-Signature-verified (constant-time compare) and bills re-fetched before recording payment.

## Project structure

```
src/
  app/
    page.tsx                         Home (listings)
    stays/[slug]/page.tsx            Listing + booking
    stays/[slug]/checkout/page.tsx   Checkout
    booking/[id]/page.tsx            Receipt / QR pass
    api/bookings/route.ts            Create hold + PaymentIntent
    api/stripe/webhook/route.ts      Stripe webhook
    api/billplz/callback, return     Billplz callback + guest redirect
    login/, auth/callback, auth/signout
    host/                            Dashboard (overview, calendar, bookings, check-in, content, settings, actions.ts)
  components/
    booking/   calendar, guest selector, price breakdown, panel, mobile sheet
    checkout/  checkout flow (Stripe + Billplz method chooser)
    property/  gallery (3 hero layouts) + lightbox, amenities, host card, content sections
    i18n/      locale provider + EN/BM switcher
    receipt/   QR pass, poller, actions
    host/      nav, availability manager, booking actions, forms, photo manager, content editor, live preview
    ui/        button, field, bottom sheet, status badge
  lib/         pricing, dates, validation, messaging, content (sections/branding schema), i18n (EN/BM dictionary),
               Supabase/Stripe/Billplz clients, booking service
  proxy.ts     Session refresh + /host guard (Next.js 16 "proxy", formerly middleware)
supabase/
  migrations/  SQL migrations
  seed.sql     Demo data
```

## Deploying (Vercel)

1. Push to GitHub → import in Vercel.
2. Add all environment variables (Production + Preview). Set `NEXT_PUBLIC_SITE_URL` to the production URL.
3. Add the production Stripe webhook (step 6.5) and Supabase redirect URL (step 5.1).
4. Switch to Stripe live keys when ready.
5. Set `CRON_SECRET` (and optionally `RESEND_API_KEY`, `EMAIL_FROM`) — the daily cron in `vercel.json` is picked up automatically.
6. When Billplz is approved, add the four `BILLPLZ_*` variables and redeploy (section 6b).

## Notes & limitations

- Stripe sends receipt emails automatically only in live mode (and only if enabled in Stripe settings). Transactional emails are sent through Resend only when `RESEND_API_KEY` is set; otherwise guest messaging is via WhatsApp/SMS deep links.
- Expired holds are released whenever a new booking is attempted. The daily cron also releases them.
- Payouts in the dashboard read the Stripe account the secret key belongs to (single-host setup). Multi-host marketplaces would need Stripe Connect.
- iCal sync is fetched server-side with an SSRF guard (https only, public IPs only, ≤2 MB, 10 s). Live fetching from Airbnb/Agoda/Booking.com was not tested in development.
- `npm audit` reports 5 *high* advisories in **dev-only** lint tooling (`braces` via `eslint-config-next` → `fast-glob`); no patched `braces` exists yet and production dependencies are clean (`npm audit --omit=dev` = 0). Re-check after upgrading `eslint-config-next`.
- The Stripe API version is pinned in `src/lib/stripe-version.ts`; a test fails if a `stripe` SDK upgrade changes the default, so upgrades are always deliberate.
