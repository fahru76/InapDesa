/**
 * Pinned Stripe API version. Equal to the default of the installed SDK (stripe@23), written out so an SDK upgrade can
 * never silently change API behaviour. To upgrade: read Stripe's API changelog, change this value on purpose, update
 * the webhook endpoint's API version in the Stripe dashboard, then run `npm run verify`.
 * `stripe-version.test.ts` fails if the SDK's default moves away from this value.
 */
export const STRIPE_API_VERSION = "2026-09-30.endive";
