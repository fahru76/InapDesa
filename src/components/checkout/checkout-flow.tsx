"use client";

import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Appearance, type Stripe as StripeJs } from "@stripe/stripe-js";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, CircleAlert, CreditCard, Hourglass, Landmark, Lock, QrCode, ShieldAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useT } from "@/components/i18n/locale";
import type { WalletBrand, WalletOption } from "@/lib/billplz-core";
import type { MessageKey } from "@/lib/i18n";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { guestDetailsSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field, inputStyles } from "@/components/ui/field";

interface CheckoutFlowProps {
  stripePublishableKey: string | null;
  propertyId: string;
  propertySlug: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  /** Number of children (named to avoid clashing with React's `children` prop). */
  childGuests: number;
  infants: number;
  dueNow: number;
  currency: string;
  isFullPayment: boolean;
  /** Billplz wallets on offer; null when Billplz isn't available for this homestay. */
  wallets: WalletOption[] | null;
  /** Guest declared they're not a Malaysian citizen/PR (from ?foreign=1). */
  foreignGuest: boolean;
  /** Tourism tax per room per night, formatted — null when the owner hasn't enabled it. */
  tourismTaxRate: string | null;
}

interface StripeSession {
  provider: "stripe";
  bookingId: string;
  accessToken: string;
  clientSecret: string;
  holdExpiresAt: string;
  reference: string;
}

type Method = "card" | "local";
type FieldErrors = Partial<Record<"name" | "email" | "phone" | "specialRequests", string>>;

let stripePromise: Promise<StripeJs | null> | null = null;
const getStripe = (key: string) => (stripePromise ??= loadStripe(key));

const BRAND_ICON: Record<WalletBrand, typeof Wallet> = { tng: Wallet, boost: Wallet, shopeepay: Wallet, grabpay: Wallet, duitnow: QrCode };

export function CheckoutFlow(props: CheckoutFlowProps) {
  const t = useT();
  const localAvailable = props.wallets !== null;
  const cardAvailable = props.stripePublishableKey !== null;
  const [session, setSession] = useState<StripeSession | null>(null);
  const [method, setMethod] = useState<Method>(cardAvailable ? "card" : "local");
  const [gateway, setGateway] = useState<string>(""); // "" = FPX / choose on Billplz
  const [form, setForm] = useState({ name: "", email: "", phone: "", specialRequests: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<{ message: string; datesTaken: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const amountLabel = formatMoney(props.dueNow, props.currency);
  const methodLabel = gateway ? (props.wallets?.find((w) => w.code === gateway)?.label ?? "Billplz") : t("co.fpxAll");

  const backHref = `/stays/${props.propertySlug}?${new URLSearchParams({
    checkIn: props.checkIn,
    checkOut: props.checkOut,
    adults: String(props.adults),
    children: String(props.childGuests),
    infants: String(props.infants),
  })}`;

  const fieldMessage: Record<keyof FieldErrors, MessageKey | null> = { name: "co.err.name", email: "co.err.email", phone: "co.err.phone", specialRequests: null };

  async function onSubmitDetails(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = guestDetailsSchema.safeParse(form);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        const k = fieldMessage[key];
        next[key] ??= k ? t(k) : issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);
    const provider = method === "local" ? "billplz" : "stripe";
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: props.propertyId,
          checkIn: props.checkIn,
          checkOut: props.checkOut,
          adults: props.adults,
          children: props.childGuests,
          infants: props.infants,
          guest: parsed.data,
          provider,
          foreignGuest: props.foreignGuest,
          gatewayCode: provider === "billplz" && gateway ? gateway : null,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        code?: string;
        provider?: "stripe" | "billplz";
        redirectUrl?: string;
        clientSecret?: string;
        bookingId?: string;
        accessToken?: string;
        holdExpiresAt?: string;
        reference?: string;
      };
      if (!res.ok) {
        setFormError({ message: data.error ?? t("co.failedStart"), datesTaken: data.code === "unavailable" });
        return;
      }
      if (data.provider === "billplz" && data.redirectUrl) {
        setRedirecting(true);
        window.location.assign(data.redirectUrl);
        return;
      }
      if (data.provider === "stripe" && data.clientSecret && data.bookingId && data.accessToken && data.holdExpiresAt && data.reference) {
        setSession({
          provider: "stripe",
          bookingId: data.bookingId,
          accessToken: data.accessToken,
          clientSecret: data.clientSecret,
          holdExpiresAt: data.holdExpiresAt,
          reference: data.reference,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setFormError({ message: t("co.failedStart"), datesTaken: false });
    } catch {
      setFormError({ message: t("co.network"), datesTaken: false });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Steps current={session ? 2 : 1} />

      <AnimatePresence mode="wait" initial={false}>
        {!session ? (
          <motion.form
            key="details"
            onSubmit={onSubmitDetails}
            noValidate
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 space-y-5"
          >
            <h2 className="display text-3xl">{t("co.whoStaying")}</h2>
            <Field label={t("co.name")} htmlFor="name" error={errors.name}>
              <input id="name" autoComplete="name" className={inputStyles} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={!!errors.name} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={t("co.email")} htmlFor="email" error={errors.email} hint={t("co.email.hint")}>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  className={inputStyles}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  aria-invalid={!!errors.email}
                />
              </Field>
              <Field label={t("co.phone")} htmlFor="phone" error={errors.phone} hint={t("co.phone.hint")}>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  className={inputStyles}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  aria-invalid={!!errors.phone}
                />
              </Field>
            </div>
            <Field label={t("co.message")} htmlFor="requests" error={errors.specialRequests} hint={t("co.message.hint")}>
              <textarea
                id="requests"
                rows={3}
                maxLength={1000}
                className={cn(inputStyles, "resize-none")}
                value={form.specialRequests}
                onChange={(e) => setForm({ ...form, specialRequests: e.target.value })}
              />
            </Field>

            {props.tourismTaxRate && <ForeignGuestToggle checked={props.foreignGuest} rate={props.tourismTaxRate} />}

            {localAvailable && (
              <fieldset className="space-y-3 pt-2">
                <legend className="mb-3 text-base font-semibold tracking-tight">{t("co.howPay")}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {cardAvailable && (
                    <MethodCard
                      checked={method === "card"}
                      onSelect={() => setMethod("card")}
                      icon={CreditCard}
                      title={t("co.method.card")}
                      hint={t("co.method.card.hint")}
                    />
                  )}
                  <MethodCard checked={method === "local"} onSelect={() => setMethod("local")} icon={Wallet} title={t("co.method.local")} hint={t("co.method.local.hint")} />
                </div>

                <AnimatePresence initial={false}>
                  {method === "local" && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="mt-2 mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-400">{t("co.pickWallet")}</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("co.pickWallet")}>
                        {props.wallets?.map((w) => {
                          const Icon = BRAND_ICON[w.brand];
                          return (
                            <Tile key={w.code} checked={gateway === w.code} onSelect={() => setGateway(w.code)}>
                              <Icon className="size-4 text-brand-600" aria-hidden />
                              <span className="text-sm font-semibold">{w.label}</span>
                            </Tile>
                          );
                        })}
                        <Tile checked={gateway === ""} onSelect={() => setGateway("")}>
                          <Landmark className="size-4 text-brand-600" aria-hidden />
                          <span>
                            <span className="block text-sm font-semibold">{t("co.fpxAll")}</span>
                            <span className="block text-[11px] text-zinc-500">{t("co.fpxAll.hint")}</span>
                          </span>
                        </Tile>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </fieldset>
            )}

            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <div>
                  <p>{formError.message}</p>
                  {formError.datesTaken && (
                    <Link href={backHref} className="mt-1 inline-block font-semibold underline underline-offset-4">
                      {t("co.chooseOther")}
                    </Link>
                  )}
                </div>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={submitting || redirecting}>
              {method === "local" ? (
                <>
                  <Lock className="size-4" aria-hidden />
                  {t("co.continueLocal", { amount: amountLabel, method: methodLabel })}
                </>
              ) : (
                t("co.continue")
              )}
            </Button>
            <p className="text-center text-xs text-zinc-500" aria-live="polite">
              {redirecting ? t("co.redirecting") : t("co.held")}
            </p>
            <p className="mx-auto flex max-w-sm items-start gap-1.5 text-xs leading-5 text-zinc-500">
              <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-brass-ink dark:text-brass-light" aria-hidden />
              {t("co.safePay")}
            </p>
          </motion.form>
        ) : (
          <motion.div
            key="payment"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="display text-3xl">{t("co.paySecurely")}</h2>
              <HoldTimer expiresAt={session.holdExpiresAt} />
            </div>
            {props.stripePublishableKey && (
              <StripeElements publishableKey={props.stripePublishableKey} clientSecret={session.clientSecret} locale={t.locale}>
                <PaymentStep session={session} amountLabel={amountLabel} isFullPayment={props.isFullPayment} onBack={() => setSession(null)} />
              </StripeElements>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MethodCard({ checked, onSelect, icon: Icon, title, hint }: { checked: boolean; onSelect: () => void; icon: typeof Wallet; title: string; hint: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-2xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500",
        checked ? "border-brand-500 bg-brand-50/60 ring-4 ring-brand-500/10 dark:bg-brand-500/10" : "border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800/80",
      )}
    >
      <input type="radio" name="pay-method" checked={checked} onChange={onSelect} className="sr-only" />
      <Icon className={cn("mt-0.5 size-5 shrink-0", checked ? "text-brand-600" : "text-zinc-400")} aria-hidden />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-zinc-500">{hint}</span>
      </span>
    </label>
  );
}

function Tile({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
        checked ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20 dark:bg-brand-500/10" : "border-zinc-200/80 bg-paper hover:border-zinc-300 dark:border-zinc-800/80 dark:bg-zinc-900",
      )}
    >
      {children}
    </button>
  );
}

function StripeElements({ publishableKey, clientSecret, locale, children }: { publishableKey: string; clientSecret: string; locale: "en" | "ms"; children: ReactNode }) {
  const appearance = useMemo<Appearance>(() => {
    const dark = typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const border = dark ? "rgb(39 39 42 / 0.8)" : "rgb(228 228 231 / 0.8)";
    const accent = typeof window !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue("--color-brand-600").trim() || "#059669" : "#059669";
    return {
      theme: dark ? "night" : "stripe",
      variables: {
        colorPrimary: /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#059669",
        colorText: dark ? "#f4f4f5" : "#0f172a",
        colorDanger: "#dc2626",
        borderRadius: "12px",
        fontFamily: '"Plus Jakarta Sans Variable", ui-sans-serif, system-ui, sans-serif',
        spacingUnit: "4px",
      },
      rules: {
        ".Input": { boxShadow: "0 1px 2px rgb(15 23 42 / 0.04)", borderColor: border },
        ".Input:focus": { boxShadow: "0 0 0 4px rgb(16 185 129 / 0.15)" },
        ".AccordionItem": { borderColor: border },
      },
    };
  }, []);

  return (
    <Elements stripe={getStripe(publishableKey)} options={{ clientSecret, appearance, locale: locale === "ms" ? "ms" : "en" }}>
      {children}
    </Elements>
  );
}

function PaymentStep({ session, amountLabel, isFullPayment, onBack }: { session: StripeSession; amountLabel: string; isFullPayment: boolean; onBack: () => void }) {
  const t = useT();
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [expressAvailable, setExpressAvailable] = useState(false);

  const returnUrl = () => `${window.location.origin}/booking/${session.bookingId}?token=${session.accessToken}`;

  async function confirm() {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? t("co.checkDetails"));
      setPaying(false);
      return;
    }
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      clientSecret: session.clientSecret,
      confirmParams: { return_url: returnUrl() },
    });
    // Only reached on immediate errors; success redirects to return_url.
    setError(confirmError.message ?? t("co.paymentFailed"));
    setPaying(false);
  }

  return (
    <div className="space-y-5">
      <div className={cn(!expressAvailable && "hidden")}>
        <ExpressCheckoutElement
          options={{ buttonHeight: 48, buttonType: { applePay: "book", googlePay: "book" } }}
          onReady={({ availablePaymentMethods }) => setExpressAvailable(!!availablePaymentMethods && Object.values(availablePaymentMethods).some(Boolean))}
          onConfirm={async () => {
            if (!stripe || !elements) return;
            const { error: confirmError } = await stripe.confirmPayment({
              elements,
              clientSecret: session.clientSecret,
              confirmParams: { return_url: returnUrl() },
            });
            if (confirmError) setError(confirmError.message ?? t("co.paymentFailed"));
          }}
        />
        <div className="my-5 flex items-center gap-3 text-xs font-medium tracking-wider text-zinc-400 uppercase">
          <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> {t("co.orPay")} <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </div>

      {!ready && <div className="skeleton h-48 w-full" aria-hidden />}
      <PaymentElement
        onReady={() => setReady(true)}
        options={{ layout: { type: "accordion", defaultCollapsed: false, radios: "if_multiple", spacedAccordionItems: true }, business: { name: "InapDesa" } }}
      />

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button size="lg" className="w-full" onClick={confirm} loading={paying} disabled={!stripe || !ready}>
        <Lock className="size-4" aria-hidden />
        {isFullPayment ? t("co.payNow", { amount: amountLabel }) : t("co.payDeposit", { amount: amountLabel })}
      </Button>

      <div className="flex items-center justify-between text-xs text-zinc-500">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 font-medium hover:text-ink dark:hover:text-white">
          <ArrowLeft className="size-3.5" aria-hidden /> {t("co.editDetails")}
        </button>
        <span>
          {t("co.ref")} <span className="font-mono font-semibold">{session.reference}</span>
        </span>
      </div>
    </div>
  );
}

function HoldTimer({ expiresAt }: { expiresAt: string }) {
  const t = useT();
  const [remaining, setRemaining] = useState(() => Math.max(0, Date.parse(expiresAt) - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, Date.parse(expiresAt) - Date.now())), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const low = remaining < 3 * 60_000;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums",
        low ? "bg-terracotta-500/10 text-terracotta-600" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
      )}
      role="timer"
    >
      <Hourglass className="size-3.5" aria-hidden />
      {remaining > 0 ? t("co.heldFor", { time: `${mins}:${String(secs).padStart(2, "0")}` }) : t("co.holdExpired")}
    </span>
  );
}

function Steps({ current }: { current: 1 | 2 }) {
  const t = useT();
  const steps = [t("co.step.details"), t("co.step.payment")];
  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full text-xs font-bold transition",
                active ? "bg-ink text-white dark:bg-paper dark:text-ink" : done ? "bg-brand-600 text-white" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800",
              )}
            >
              {done ? "✓" : n}
            </span>
            <span className={cn("font-medium", active ? "text-ink dark:text-white" : "text-zinc-500")}>{label}</span>
            {i < steps.length - 1 && <span className="h-px w-8 bg-zinc-200 dark:bg-zinc-800" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Tourism tax declaration. Updates ?foreign=1 so the server re-prices the summary. */
function ForeignGuestToggle({ checked, rate }: { checked: boolean; rate: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(checked);
  // Reset the optimistic value when the server-confirmed prop changes (React's "adjust state on prop change" pattern).
  const [confirmed, setConfirmed] = useState(checked);
  if (checked !== confirmed) {
    setConfirmed(checked);
    setOn(checked);
  }
  const toggle = (next: boolean) => {
    setOn(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("foreign", "1");
    else url.searchParams.delete("foreign");
    startTransition(() => router.replace(`${url.pathname}?${url.searchParams}`, { scroll: false }));
  };
  return (
    <label className={cn("flex items-start gap-3 rounded-2xl border border-zinc-200/80 p-4 text-sm dark:border-zinc-800/80", pending && "opacity-60")}>
      <input type="checkbox" checked={on} disabled={pending} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
      <span>
        <span className="block font-medium">{t("co.foreign")}</span>
        <span className="block text-xs text-zinc-500">{t("co.foreign.hint", { rate })}</span>
      </span>
    </label>
  );
}
