import "server-only";

import Stripe from "stripe";
import { serverEnv } from "@/lib/env";
import { STRIPE_API_VERSION } from "@/lib/stripe-version";

let stripeClient: Stripe | undefined;

/** Server-side Stripe client. */
export function getStripe(): Stripe {
  stripeClient ??= new Stripe(serverEnv.stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: { name: "InapDesa", version: "1.0.0" },
    maxNetworkRetries: 2,
  });
  return stripeClient;
}

export type { Stripe };
