import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { LanguageSwitcher } from "@/components/i18n/locale";
import { AwanDivider, RebungBand } from "@/components/ui/ornament";
import { getT } from "@/lib/i18n-server";

export function Logo({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 ${className}`} aria-label="InapDesa home">
      <span
        className={`relative grid size-8 place-items-center overflow-hidden rounded-xl shadow-soft ${tone === "dark" ? "bg-ivory text-ink" : "bg-ink text-ivory dark:bg-ivory dark:text-ink"}`}
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 10v9h12v-9" strokeLinejoin="round" />
          <path d="M10 19v-4.5a2 2 0 0 1 4 0V19" className="text-brass" stroke="currentColor" />
        </svg>
      </span>
      <span className="font-display text-[23px] leading-none font-semibold tracking-tight">
        Inap<span className={tone === "dark" ? "text-brass-light italic" : "text-brass-ink italic dark:text-brass-light"}>Desa</span>
      </span>
    </Link>
  );
}

export async function SiteHeader() {
  const t = await getT();
  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0 border-b-zinc-200/70 dark:border-b-zinc-800/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Logo />
        <nav className="flex items-center gap-1.5 text-sm font-medium">
          <Link href="/" className="hidden rounded-full px-4 py-2 text-zinc-600 transition hover:bg-zinc-100 hover:text-ink sm:inline-flex dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white">
            {t("nav.stays")}
          </Link>
          <LanguageSwitcher />
          <Link
            href="/host"
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 px-3 py-2 text-zinc-700 transition hover:border-zinc-300 hover:shadow-soft sm:px-4 dark:border-zinc-800/80 dark:text-zinc-300 dark:hover:border-zinc-700"
          >
            <LayoutDashboard className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("nav.host")}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="grain relative isolate overflow-hidden bg-teak-900 text-ivory/70">
      <RebungBand className="text-brass/30" />
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 px-4 py-14 text-center text-sm sm:px-6 lg:px-8">
        <Logo tone="dark" />
        <AwanDivider className="text-brass/70" />
        <p className="max-w-md font-display text-lg text-ivory/80 italic">{t("footer.tagline")}</p>
        <p className="text-xs tracking-[0.2em] text-ivory/60 uppercase">© {new Date().getFullYear()} InapDesa</p>
      </div>
    </footer>
  );
}
