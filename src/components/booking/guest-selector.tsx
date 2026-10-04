"use client";

import { Minus, Plus } from "lucide-react";
import type { GuestCounts } from "@/lib/pricing";
import { useT } from "@/components/i18n/locale";
import { cn } from "@/lib/utils";

interface GuestSelectorProps {
  value: GuestCounts;
  onChange: (value: GuestCounts) => void;
  maxGuests: number;
  maxInfants: number;
}

export function GuestSelector({ value, onChange, maxGuests, maxInfants }: GuestSelectorProps) {
  const t = useT();
  const seated = value.adults + value.children;
  const rows: { key: keyof GuestCounts; label: string; hint: string; min: number; max: number }[] = [
    { key: "adults", label: t("guests.adults"), hint: t("guests.adults.hint"), min: 1, max: maxGuests - value.children },
    { key: "children", label: t("guests.children"), hint: t("guests.children.hint"), min: 0, max: maxGuests - value.adults },
    { key: "infants", label: t("guests.infantsLabel"), hint: t("guests.infants.hint"), min: 0, max: maxInfants },
  ];

  return (
    <div>
      <ul className="divide-y divide-zinc-200/80 dark:divide-zinc-800/80">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between py-3.5">
            <div>
              <p className="font-medium">{row.label}</p>
              <p className="text-xs text-zinc-500">{row.hint}</p>
            </div>
            <Stepper
              label={row.label}
              value={value[row.key]}
              min={row.min}
              max={row.max}
              onChange={(n) => onChange({ ...value, [row.key]: n })}
            />
          </li>
        ))}
      </ul>
      <p className={cn("mt-1 text-xs", seated >= maxGuests ? "font-medium text-terracotta-600" : "text-zinc-500")}>
        {seated >= maxGuests ? t("guests.max", { n: maxGuests }) : t("guests.sleeps", { n: maxGuests })}
      </p>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const t = useT();
  const btn =
    "grid size-9 place-items-center rounded-full border border-zinc-300 text-zinc-700 transition hover:border-ink hover:text-ink active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-white";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={t("guests.fewer", { label: label.toLowerCase() })}>
        <Minus className="size-4" />
      </button>
      <output className="w-5 text-center text-[15px] font-semibold tabular-nums" aria-live="polite">
        {value}
      </output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={t("guests.more", { label: label.toLowerCase() })}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}
