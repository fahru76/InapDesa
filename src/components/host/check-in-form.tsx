"use client";

import { CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { checkInBooking } from "@/app/host/actions";
import { Button } from "@/components/ui/button";

export function CheckInForm({ bookingId, outstandingLabel, hasOutstanding }: { bookingId: string; outstandingLabel: string; hasOutstanding: boolean }) {
  const router = useRouter();
  const [collected, setCollected] = useState(!hasOutstanding);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const res = await checkInBooking(bookingId, hasOutstanding && collected);
      if (!res.ok) {
        setError(res.message ?? "Check-in failed.");
        return;
      }
      router.refresh();
    });

  return (
    <div className="space-y-4">
      {hasOutstanding && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-zinc-200/80 bg-paper p-4 dark:border-zinc-800/80 dark:bg-zinc-900">
          <input type="checkbox" checked={collected} onChange={(e) => setCollected(e.target.checked)} className="mt-0.5 size-5 accent-brand-600" />
          <span>
            <span className="block font-semibold">Balance collected: {outstandingLabel}</span>
            <span className="text-sm text-zinc-500">Recorded as an on-site payment (cash, DuitNow QR or card terminal).</span>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
      <Button size="lg" className="w-full" onClick={submit} loading={pending} disabled={hasOutstanding && !collected}>
        <CircleCheck className="size-5" aria-hidden /> Check guest in
      </Button>
      {hasOutstanding && !collected && <p className="text-center text-xs text-zinc-500">Tick the box once the balance has been paid.</p>}
    </div>
  );
}
