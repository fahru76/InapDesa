"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { CreditCard, Wallet } from "lucide-react";
import { useState } from "react";
import { useT } from "@/components/i18n/locale";
import { Button } from "@/components/ui/button";

let stripePromise: Promise<StripeJs | null> | null = null;
const getStripe = (key: string) => (stripePromise ??= loadStripe(key));

/** "Pay the balance now" card on the booking pass (Stripe inline, or redirect to Billplz). */
export function BalancePay({
  bookingId,
  token,
  amountLabel,
  stripeKey,
  localAvailable,
}: {
  bookingId: string;
  token: string;
  amountLabel: string;
  stripeKey: string | null;
  localAvailable: boolean;
}) {
  const t = useT();
  const [busy, setBusy] = useState<"stripe" | "billplz" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  async function start(provider: "stripe" | "billplz") {
    setBusy(provider);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, provider }),
      });
      const data = (await res.json()) as { error?: string; clientSecret?: string; redirectUrl?: string };
      if (!res.ok) throw new Error(data.error ?? t("bal.error"));
      if (data.redirectUrl) {
        window.location.assign(data.redirectUrl);
        return;
      }
      if (data.clientSecret) setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("bal.error"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card mt-8 p-6 sm:p-8 no-print">
      <h2 className="display text-2xl">{t("bal.title")}</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{t("bal.body", { amount: amountLabel })}</p>
      {clientSecret && stripeKey ? (
        <Elements stripe={getStripe(stripeKey)} options={{ clientSecret, locale: t.locale === "ms" ? "ms" : "en" }}>
          <StripeBalanceForm amountLabel={amountLabel} />
        </Elements>
      ) : (
        <div className="mt-5 flex flex-wrap gap-3">
          {stripeKey && (
            <Button onClick={() => start("stripe")} loading={busy === "stripe"} disabled={busy !== null}>
              <CreditCard className="size-4" aria-hidden /> {t("bal.card")}
            </Button>
          )}
          {localAvailable && (
            <Button variant="outline" onClick={() => start("billplz")} loading={busy === "billplz"} disabled={busy !== null}>
              <Wallet className="size-4" aria-hidden /> {t("bal.local")}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}

function StripeBalanceForm({ amountLabel }: { amountLabel: string }) {
  const t = useT();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("balance_status");
    const { error: err } = await stripe.confirmPayment({ elements, confirmParams: { return_url: url.toString() } });
    if (err) setError(err.message ?? t("bal.failed"));
    setBusy(false);
  }

  return (
    <div className="mt-5 space-y-4">
      <PaymentElement />
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button size="lg" className="w-full" onClick={pay} loading={busy} disabled={!stripe}>
        {t("bal.pay", { amount: amountLabel })}
      </Button>
    </div>
  );
}
