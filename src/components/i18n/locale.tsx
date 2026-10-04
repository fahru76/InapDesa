"use client";

import { Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useTransition, type ReactNode } from "react";
import type { Locale } from "@/lib/content";
import { LOCALE_COOKIE, makeT, type T } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LocaleContext = createContext<T>(makeT("en"));

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = useMemo(() => makeT(locale), [locale]);
  return <LocaleContext.Provider value={t}>{children}</LocaleContext.Provider>;
}

export function useT(): T {
  return useContext(LocaleContext);
}

/** Remembers the guest's language for a year and updates <html lang> (called from an event handler). */
function persistLocale(next: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = next;
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const set = (next: Locale) => {
    if (next === t.locale) return;
    persistLocale(next);
    startTransition(() => router.refresh());
  };

  return (
    <div
      role="group"
      aria-label={t("lang.switch")}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-zinc-200/80 p-0.5 text-xs font-semibold dark:border-zinc-800/80",
        pending && "opacity-60",
        className,
      )}
    >
      <Globe className="mx-1 size-3.5 text-zinc-400" aria-hidden />
      {(["en", "ms"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={t.locale === l}
          className={cn(
            "rounded-full px-2.5 py-1 transition",
            t.locale === l ? "bg-ink text-white dark:bg-paper dark:text-ink" : "text-zinc-500 hover:text-ink dark:hover:text-white",
          )}
        >
          {l === "en" ? "EN" : "BM"}
        </button>
      ))}
    </div>
  );
}
