"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useActionState, useEffect, useState, type FormEvent } from "react";
import { saveProperty, type ActionResult } from "@/app/host/actions";
import type { Tables } from "@/lib/database.types";
import { AMENITIES } from "@/lib/amenities";
import { CANCELLATION_PRESETS, PRESET_LABELS } from "@/lib/cancellation";
import { formatMoney, toMajor, toMinor } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { SUPPORTED_CURRENCIES } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field, SectionCard, inputStyles } from "@/components/ui/field";

type Property = Tables<"properties">;

const DAYS = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 7, label: "Sun" },
];

export function PropertyForm({ property, billplzReady }: { property: Property | null; billplzReady: boolean }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(saveProperty, { ok: false });
  const currency0 = property?.currency ?? "MYR";
  const [currency, setCurrency] = useState(currency0);
  const [policy, setPolicy] = useState<"deposit" | "full">(property?.payment_policy ?? "deposit");
  const [percent, setPercent] = useState(property?.payment_policy === "full" ? 50 : (property?.deposit_percent ?? 50));
  const [weekday, setWeekday] = useState(property ? toMajor(property.weekday_rate, currency0) : 300);
  const [cleaning, setCleaning] = useState(property ? toMajor(property.cleaning_fee, currency0) : 0);

  useEffect(() => {
    if (state.ok && state.propertyId && !property) router.replace(`/host/settings?property=${state.propertyId}`);
  }, [state, property, router]);

  // Submit manually so React doesn't reset the uncontrolled fields when validation fails.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  const err = (k: string) => state.errors?.[k];
  const major = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(toMajor(v, currency0)));

  // Live example of what a guest pays today for 2 weeknights
  const exampleStay = toMinor(weekday * 2 + cleaning, currency);
  const exampleDue = policy === "full" ? exampleStay : Math.round((exampleStay * percent) / 100);

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      {property && <input type="hidden" name="id" value={property.id} />}

      <SectionCard title="Listing" description="Internal name, link and visibility.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Title" htmlFor="title" error={err("title")} className="sm:col-span-2">
            <input id="title" name="title" required defaultValue={property?.title} className={inputStyles} aria-invalid={!!err("title")} />
          </Field>
          <Field label="URL slug" htmlFor="slug" error={err("slug")} hint="/stays/your-slug">
            <input id="slug" name="slug" required defaultValue={property?.slug} className={inputStyles} aria-invalid={!!err("slug")} />
          </Field>
          <label className="flex items-center gap-3 sm:col-span-2">
            <input type="checkbox" name="is_published" defaultChecked={property?.is_published ?? false} className="size-5 accent-brand-600" />
            <span>
              <span className="block text-sm font-semibold">Published</span>
              <span className="text-xs text-zinc-500">Visible to guests and open for booking.</span>
            </span>
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Location">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Address" htmlFor="address_line" error={err("address_line")} hint="Shared with guests after booking" className="sm:col-span-2">
            <input id="address_line" name="address_line" defaultValue={property?.address_line ?? ""} className={inputStyles} />
          </Field>
          <Field label="Town / city" htmlFor="city" error={err("city")}>
            <input id="city" name="city" required defaultValue={property?.city} className={inputStyles} aria-invalid={!!err("city")} />
          </Field>
          <Field label="State / region" htmlFor="region" error={err("region")}>
            <input id="region" name="region" defaultValue={property?.region ?? ""} className={inputStyles} />
          </Field>
          <Field label="Country" htmlFor="country" error={err("country")}>
            <input id="country" name="country" defaultValue={property?.country ?? "Malaysia"} className={inputStyles} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Space & capacity">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <NumberField name="bedrooms" label="Bedrooms" value={property?.bedrooms ?? 1} error={err("bedrooms")} />
          <NumberField name="beds" label="Beds" value={property?.beds ?? 1} error={err("beds")} />
          <NumberField name="bathrooms" label="Bathrooms" value={Number(property?.bathrooms ?? 1)} step="0.5" error={err("bathrooms")} />
          <NumberField name="max_guests" label="Max guests" value={property?.max_guests ?? 4} hint="Adults + children" error={err("max_guests")} />
          <NumberField name="max_infants" label="Max infants" value={property?.max_infants ?? 2} error={err("max_infants")} />
          <div className="hidden sm:block" />
          <Field label="Check-in from" htmlFor="check_in_time" error={err("check_in_time")}>
            <input id="check_in_time" name="check_in_time" type="time" defaultValue={(property?.check_in_time ?? "15:00").slice(0, 5)} className={inputStyles} />
          </Field>
          <Field label="Check-out by" htmlFor="check_out_time" error={err("check_out_time")}>
            <input id="check_out_time" name="check_out_time" type="time" defaultValue={(property?.check_out_time ?? "11:00").slice(0, 5)} className={inputStyles} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Pricing & advance payment" description="Enter amounts in whole currency units (e.g. 380 = RM 380).">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          <Field label="Currency" htmlFor="currency" error={err("currency")}>
            <select id="currency" name="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputStyles}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Weeknight rate" htmlFor="weekday_rate" error={err("weekday_rate")}>
            <input
              id="weekday_rate"
              name="weekday_rate"
              type="number"
              min="1"
              step="0.01"
              defaultValue={major(property?.weekday_rate) || "300"}
              onChange={(e) => setWeekday(Number(e.target.value) || 0)}
              className={inputStyles}
            />
          </Field>
          <Field label="Weekend rate" htmlFor="weekend_rate" error={err("weekend_rate")}>
            <input id="weekend_rate" name="weekend_rate" type="number" min="1" step="0.01" defaultValue={major(property?.weekend_rate) || "380"} className={inputStyles} />
          </Field>
          <fieldset className="col-span-2 sm:col-span-3">
            <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Weekend nights</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d.n} className="cursor-pointer">
                  <input type="checkbox" name="weekend_days" value={d.n} defaultChecked={(property?.weekend_days ?? [5, 6]).includes(d.n)} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-zinc-200/80 px-3.5 py-1.5 text-sm font-medium transition peer-checked:border-terracotta-500 peer-checked:bg-terracotta-500/10 peer-checked:text-terracotta-600 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 dark:border-zinc-800/80">
                    {d.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Cleaning fee" htmlFor="cleaning_fee" error={err("cleaning_fee")}>
            <input
              id="cleaning_fee"
              name="cleaning_fee"
              type="number"
              min="0"
              step="0.01"
              defaultValue={major(property?.cleaning_fee) || "0"}
              onChange={(e) => setCleaning(Number(e.target.value) || 0)}
              className={inputStyles}
            />
          </Field>
          <Field label="Security deposit" htmlFor="security_deposit" error={err("security_deposit")} hint="Refundable">
            <input id="security_deposit" name="security_deposit" type="number" min="0" step="0.01" defaultValue={major(property?.security_deposit) || "0"} className={inputStyles} />
          </Field>
          <NumberField
            name="security_deposit_return_days"
            label="Return deposit within (days)"
            value={property?.security_deposit_return_days ?? 3}
            hint="After check-out. 0 = at check-out."
            error={err("security_deposit_return_days")}
          />
          <NumberField name="min_nights" label="Min nights" value={property?.min_nights ?? 1} error={err("min_nights")} />
          <NumberField name="max_nights" label="Max nights" value={property?.max_nights ?? 30} error={err("max_nights")} />
        </div>

        <fieldset className="mt-6">
          <legend className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Advance payment policy</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <PolicyOption
              name="payment_policy"
              value="deposit"
              checked={policy === "deposit"}
              onChange={() => setPolicy("deposit")}
              title="Deposit to lock dates"
              body="Guest pays a percentage now; the rest (plus security deposit) on check-in."
            />
            <PolicyOption
              name="payment_policy"
              value="full"
              checked={policy === "full"}
              onChange={() => setPolicy("full")}
              title="Pay in full"
              body="Guest pays the whole stay and security deposit when booking."
            />
          </div>
          <input type="hidden" name="deposit_percent" value={policy === "full" ? 100 : percent} />
          {policy === "deposit" && (
            <div className="mt-5">
              <label htmlFor="deposit_range" className="flex items-center justify-between text-sm font-medium">
                Deposit percentage <span className="tabular-nums text-brand-700 dark:text-brand-400">{percent}%</span>
              </label>
              <input id="deposit_range" type="range" min={10} max={100} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="mt-2 w-full accent-brand-600" />
            </div>
          )}
          <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
            Example: 2 weeknights + cleaning = <strong>{formatMoney(exampleStay, currency)}</strong>. Guest pays{" "}
            <strong className="text-brand-700 dark:text-brand-400">{formatMoney(exampleDue, currency)}</strong> today{policy === "full" ? " (plus any security deposit)" : ""}.
          </p>
        </fieldset>
      </SectionCard>

      <SectionCard title="Cancellation & tourism tax" description="Guests see exact refund amounts and deadline dates at checkout and on their booking pass.">
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">Cancellation policy</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {CANCELLATION_PRESETS.map((p) => (
              <PolicyOption
                key={p}
                name="cancellation_preset"
                value={p}
                defaultChecked={(property?.cancellation_preset ?? "moderate") === p}
                title={PRESET_LABELS[p].label}
                body={PRESET_LABELS[p].hint}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-zinc-500">The security deposit and tourism tax are always refunded on cancellation. Your own wording (Content → Rules &amp; policies) still shows alongside.</p>
        </fieldset>

        <div className="mt-6 rounded-2xl border border-zinc-200/80 p-4 dark:border-zinc-800/80">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="tourism_tax_enabled" defaultChecked={property?.tourism_tax_enabled ?? false} className="mt-0.5 size-5 accent-brand-600" />
            <span>
              <span className="block text-sm font-semibold">Charge tourism tax to foreign guests</span>
              <span className="text-xs text-zinc-500">
                Guests tick &ldquo;not a Malaysian citizen or PR&rdquo; at checkout and see it as its own line. Check with the Royal Malaysian Customs Department (MyTTx) whether your
                property must collect it and at what rate.
              </span>
            </span>
          </label>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Rate per room per night" htmlFor="tourism_tax_rate" error={err("tourism_tax_rate")} hint={`In ${currency}`}>
              <input id="tourism_tax_rate" name="tourism_tax_rate" type="number" min="0" step="0.01" defaultValue={major(property?.tourism_tax_rate ?? 1000) || "10"} className={inputStyles} />
            </Field>
            <NumberField name="tourism_tax_rooms" label="Rooms charged" value={property?.tourism_tax_rooms ?? 1} hint="Usually the number of rooms let" error={err("tourism_tax_rooms")} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Amenities">
        <div className="flex flex-wrap gap-2">
          {AMENITIES.map((a) => {
            const Icon = a.icon;
            return (
              <label key={a.key} className="cursor-pointer">
                <input type="checkbox" name="amenities" value={a.key} defaultChecked={property?.amenities.includes(a.key)} className="peer sr-only" />
                <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 px-3.5 py-2 text-sm font-medium transition peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:text-brand-800 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 dark:border-zinc-800/80 dark:peer-checked:bg-brand-500/10 dark:peer-checked:text-brand-300">
                  <Icon className="size-4" aria-hidden /> {a.label}
                </span>
              </label>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Guest contact" description="Your title, story, sections, branding and translations live in Content.">
        <Field label="WhatsApp number" htmlFor="host_phone" error={err("host_phone")} hint="Shown as a Message host button and used for guest messages">
          <input id="host_phone" name="host_phone" type="tel" defaultValue={property?.host_phone ?? ""} className={cn(inputStyles, "sm:max-w-sm")} />
        </Field>
      </SectionCard>

      <SectionCard title="Payment methods" description="Card, Apple Pay and Google Pay via Stripe are always on.">
        <label className={cn("flex items-start gap-3", currency !== "MYR" && "opacity-60")}>
          <input
            type="checkbox"
            name="billplz_enabled"
            defaultChecked={property?.billplz_enabled ?? false}
            disabled={currency !== "MYR"}
            className="mt-0.5 size-5 accent-brand-600"
          />
          <span>
            <span className="block text-sm font-semibold">Malaysian e-wallets & online banking (Billplz)</span>
            <span className="text-xs text-zinc-500">Touch &apos;n Go, Boost, ShopeePay, GrabPay, DuitNow QR and FPX. MYR listings only.</span>
          </span>
        </label>
        <p
          className={cn(
            "mt-4 rounded-xl px-4 py-3 text-sm",
            billplzReady ? "bg-brand-50 text-brand-800 dark:bg-brand-500/10 dark:text-brand-300" : "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
          )}
        >
          {billplzReady
            ? "Billplz is connected. Guests will see the e-wallet option when this is ticked."
            : "Billplz isn't connected yet — add BILLPLZ_API_KEY, BILLPLZ_COLLECTION_ID and BILLPLZ_X_SIGNATURE_KEY to your environment. Until then the option stays hidden from guests."}
        </p>
      </SectionCard>

      <div className="glass sticky bottom-24 z-20 flex items-center justify-between gap-4 rounded-2xl p-4 shadow-float lg:bottom-6">
        <p aria-live="polite" className={cn("flex items-center gap-2 text-sm", state.ok ? "text-brand-700 dark:text-brand-400" : "text-red-600")}>
          {state.message && (state.ok ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />)}
          {state.message}
        </p>
        <Button type="submit" loading={pending}>
          {property ? "Save changes" : "Create listing"}
        </Button>
      </div>
    </form>
  );
}

function NumberField({ name, label, value, error, hint, step = "1" }: { name: string; label: string; value: number; error?: string; hint?: string; step?: string }) {
  return (
    <Field label={label} htmlFor={name} error={error} hint={hint}>
      <input id={name} name={name} type="number" min="0" step={step} defaultValue={value} className={inputStyles} aria-invalid={!!error} />
    </Field>
  );
}

function PolicyOption({
  name,
  value,
  checked,
  defaultChecked,
  onChange,
  title,
  body,
}: {
  name: string;
  value: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: () => void;
  title: string;
  body: string;
}) {
  return (
    <label
      className={cn(
        "cursor-pointer rounded-2xl border border-zinc-200/80 p-4 transition hover:border-zinc-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 dark:border-zinc-800/80",
        "has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/60 has-[:checked]:ring-4 has-[:checked]:ring-brand-500/10 dark:has-[:checked]:bg-brand-500/10",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        {...(checked !== undefined ? { checked, onChange: onChange ?? (() => undefined) } : { defaultChecked })}
        className="sr-only"
      />
      <span className="block font-semibold">{title}</span>
      <span className="mt-1 block text-sm text-zinc-500">{body}</span>
    </label>
  );
}
