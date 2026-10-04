"use client";

import { Check, Copy, Link2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCalendarFeed, regenerateCalendarExport, removeCalendarFeed, syncCalendarsNow } from "@/app/host/actions";
import { Button } from "@/components/ui/button";
import { inputStyles, SectionCard } from "@/components/ui/field";
import { cn } from "@/lib/utils";

export interface FeedView {
  id: string;
  name: string;
  host: string;
  lastSyncedAt: string | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  nights: number | null;
  overlaps: string[];
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** Two-way availability sync with Airbnb, Agoda, Booking.com (iCal export + imports). */
export function CalendarSync({ propertyId, exportUrl, feeds }: { propertyId: string; exportUrl: string | null; feeds: FeedView[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      setMessage({ ok: res.ok, text: res.message ?? "" });
      if (res.ok) after?.();
      router.refresh();
    });

  const copy = async () => {
    if (!exportUrl) return;
    await navigator.clipboard.writeText(exportUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <SectionCard title="Sync with Airbnb, Agoda & Booking.com" description="Stops double bookings across platforms. Imported nights close here automatically; InapDesa bookings close there.">
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold">1. Give other platforms your InapDesa calendar</p>
          <p className="mt-1 text-xs text-zinc-500">Paste this link where they ask to &ldquo;import a calendar&rdquo;. It contains no guest details — keep it private anyway.</p>
          {exportUrl ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl bg-zinc-50 px-3 py-2 text-xs dark:bg-zinc-900">{exportUrl}</code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => window.confirm("Create a new link? The old one stops working, so you'll need to update it on every platform.") && run(() => regenerateCalendarExport(propertyId))}
              >
                New link
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-red-600">Couldn&rsquo;t create your export link. Refresh to try again.</p>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">2. Import their calendars here</p>
            {feeds.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => run(() => syncCalendarsNow(propertyId))} loading={pending}>
                <RefreshCw className="size-4" aria-hidden /> Sync now
              </Button>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500">On each platform, copy its &ldquo;export calendar&rdquo; / iCal link (ends in .ics). Synced daily, before every new booking, and when guests view your listing.</p>

          {feeds.length > 0 && (
            <ul className="mt-3 divide-y divide-zinc-200/80 rounded-2xl border border-zinc-200/80 dark:divide-zinc-800/80 dark:border-zinc-800/80">
              {feeds.map((f) => (
                <li key={f.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-semibold">
                        <Link2 className="size-4 text-zinc-400" aria-hidden /> {f.name}
                        <span className="truncate text-xs font-normal text-zinc-500">{f.host}</span>
                      </p>
                      <p className={cn("mt-1 text-xs", f.lastStatus === "error" ? "text-red-600" : "text-zinc-500")}>
                        {f.lastStatus === "error" ? f.lastError : `${f.nights ?? 0} nights imported · synced ${ago(f.lastSyncedAt)}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => window.confirm(`Disconnect ${f.name}? Its imported nights will open again.`) && run(() => removeCalendarFeed(f.id, propertyId))}
                      aria-label={`Disconnect ${f.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  {f.overlaps.length > 0 && (
                    <p className="mt-2 flex items-start gap-2 rounded-xl bg-terracotta-500/10 px-3 py-2 text-xs text-terracotta-600">
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      Also booked on InapDesa: {f.overlaps.join(", ")}. Check this isn&rsquo;t a double booking (it can also be your own InapDesa booking shown back by {f.name}).
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addCalendarFeed({ propertyId, name, url }), () => {
                setName("");
                setUrl("");
              });
            }}
          >
            <input className={inputStyles} placeholder="Airbnb" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Platform name" required />
            <input
              className={inputStyles}
              placeholder="https://www.airbnb.com/calendar/ical/…ics"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              inputMode="url"
              aria-label="Calendar link"
              required
            />
            <Button type="submit" loading={pending}>
              Connect
            </Button>
          </form>
        </div>

        {message && (
          <p role="status" className={cn("text-sm", message.ok ? "text-brand-700 dark:text-brand-300" : "text-red-600")}>
            {message.text}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
