import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { STRIPE_API_VERSION } from "./stripe-version";

describe("Stripe API version pin", () => {
  it("matches the installed SDK's default, so an SDK upgrade is a deliberate change", () => {
    // If this fails after upgrading `stripe`: review Stripe's changelog for the new version, then update
    // STRIPE_API_VERSION (and the webhook endpoint's version in the Stripe dashboard) on purpose.
    expect(STRIPE_API_VERSION).toBe(Stripe.API_VERSION);
  });
});
