"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitReview } from "@/app/booking/[id]/actions";
import { useT } from "@/components/i18n/locale";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";
import { cn } from "@/lib/utils";

/** One-time review form on the booking pass after check-out. */
export function ReviewForm({ bookingId, token, defaultName }: { bookingId: string; token: string; defaultName: string }) {
  const t = useT();
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [body, setBody] = useState("");
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const res = await submitReview({ bookingId, token, rating, body, displayName: name });
      if (!res.ok) {
        setError(res.message ?? null);
        return;
      }
      setDone(true);
      router.refresh();
    });

  if (done) return <p className="mt-3 text-sm font-medium text-brand-700 dark:text-brand-300">{t("rv.thanks")}</p>;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-sm font-medium">{t("rv.rating")}</p>
        <div className="mt-1 flex gap-1" role="radiogroup" aria-label={t("rv.rating")} onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t("rv.stars", { n })}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="rounded-md p-0.5"
            >
              <Star className={cn("size-7 transition", n <= (hover || rating) ? "fill-brass text-brass" : "text-zinc-300 dark:text-zinc-600")} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <label className="block text-sm font-medium">
        {t("rv.body")}
        <textarea
          rows={4}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("rv.bodyPh")}
          className={cn(inputStyles, "mt-1 resize-y")}
        />
      </label>
      <label className="block text-sm font-medium">
        {t("rv.name")}
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} className={cn(inputStyles, "mt-1 max-w-xs")} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button onClick={submit} loading={pending} disabled={rating === 0 || body.trim().length < 10 || !name.trim()}>
        {t("rv.submit")}
      </Button>
    </div>
  );
}
