"use client";

import { CalendarDays, LayoutDashboard, ListChecks, LogOut, Palette, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/host", label: "Overview", icon: LayoutDashboard },
  { href: "/host/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/host/bookings", label: "Bookings", icon: ListChecks },
  { href: "/host/content", label: "Content", icon: Palette },
  { href: "/host/settings", label: "Settings", icon: Settings },
] as const;

export function HostNav({ properties, email }: { properties: { id: string; title: string }[]; email: string }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const current = params.get("property") ?? properties[0]?.id ?? "";
  const q = current ? `?property=${current}` : "";

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">
        <div className="sticky top-24 space-y-5">
          {properties.length > 1 && (
            <select
              aria-label="Select property"
              value={current}
              onChange={(e) => router.push(`${pathname}?property=${e.target.value}`)}
              className="w-full rounded-xl border border-zinc-200/80 bg-paper px-3 py-2 text-sm font-medium dark:border-zinc-800/80 dark:bg-zinc-900"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <div className="mb-5 rounded-2xl bg-ink px-4 py-4 text-ivory shadow-float dark:bg-zinc-900">
            <p className="text-[10px] font-bold tracking-[0.2em] text-brass-light uppercase">InapDesa studio</p>
            <p className="mt-2 font-display text-2xl leading-none">Run your stay.</p>
            <p className="mt-2 text-xs leading-5 text-ivory/60">Bookings, content, and arrivals in one quiet place.</p>
          </div>
          <nav className="space-y-1" aria-label="Host">
            {LINKS.map(({ href, label, icon: Icon }) => {
              const active = href === "/host" ? pathname === "/host" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={`${href}${q}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-ink text-white shadow-soft dark:bg-paper dark:text-ink"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-ink dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
            <p className="truncate px-3 text-xs text-zinc-500">{email}</p>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="glass pb-safe fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 pt-2 lg:hidden" aria-label="Host">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = href === "/host" ? pathname === "/host" : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={`${href}${q}`}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex flex-col items-center gap-1 py-1 text-[11px] font-semibold", active ? "text-brand-700 dark:text-brand-400" : "text-zinc-500")}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
