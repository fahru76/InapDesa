"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, Copy, MessageCircle, MessageSquare, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelBooking, recordDepositReturn, replyToReview, type RefundMode } from "@/app/host/actions";
import { smsLink, TEMPLATE_LABELS, whatsappLink, type MessageTemplate } from "@/lib/messaging";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { inputStyles } from "@/components/ui/field";

interface MessageActionsProps {
  phone: string;
  messages: Record<MessageTemplate, string>;
  suggested: MessageTemplate;
}

/** One-tap guest messaging: pick a template, open WhatsApp or SMS with the text pre-filled. */
export function MessageActions({ phone, messages, suggested }: MessageActionsProps) {
  const [template, setTemplate] = useState<MessageTemplate>(suggested);
  const [copied, setCopied] = useState(false);
  const text = messages[template];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Message template"
        value={template}
        onChange={(e) => setTemplate(e.target.value as MessageTemplate)}
        className="h-9 rounded-xl border border-zinc-200/80 bg-paper px-2.5 text-sm font-medium dark:border-zinc-800/80 dark:bg-zinc-900"
      >
        {(Object.keys(TEMPLATE_LABELS) as MessageTemplate[]).map((t) => (
          <option key={t} value={t}>
            {TEMPLATE_LABELS[t]}
          </option>
        ))}
      </select>
      <a
        href={whatsappLink(phone, text)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-[#073e1f] transition hover:bg-[#1fbe5b]"
      >
        <MessageCircle className="size-4" aria-hidden /> WhatsApp
      </a>
      <a
        href={smsLink(phone, text)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-paper px-3 text-sm font-semibold transition hover:shadow-soft dark:border-zinc-800/80 dark:bg-zinc-900"
      >
        <MessageSquare className="size-4" aria-hidden /> SMS
      </a>
      <button
        type="button"
        onClick={copy}
        className="grid size-9 place-items-center rounded-xl border border-zinc-200/80 bg-paper transition hover:shadow-soft dark:border-zinc-800/80 dark:bg-zinc-900"
        aria-label="Copy message"
        title="Copy message"
      >
        {copied ? <Check className="size-4 text-brand-600" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export function CancelBookingButton({
  bookingId,
  reference,
  refundable,
  policyRefund,
  provider = "stripe",
}: {
  bookingId: string;
  reference: string;
  /** Formatted amount still refundable (null = nothing was paid online). */
  refundable: string | null;
  /** Formatted refund due under the booking's cancellation policy (null = custom text policy). */
  policyRefund: string | null;
  provider?: "stripe" | "billplz";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<RefundMode>(policyRefund ? "policy" : "full");
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const res = await cancelBooking(bookingId, reason, refundable ? mode : "none");
      setResult(res.message ?? null);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });

  const options: { value: RefundMode; label: string }[] = [
    ...(policyRefund ? [{ value: "policy" as const, label: `Refund per your cancellation policy (${policyRefund})` }] : []),
    { value: "full", label: `Full refund (${refundable ?? ""})` },
    { value: "none", label: "No refund" },
  ];

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-red-600 transition hover:bg-red-50 dark:hover:bg-red-500/10"
      >
        <Ban className="size-4" aria-hidden /> Cancel booking
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 rounded-2xl border border-red-200 bg-red-50/60 p-4 dark:border-red-500/20 dark:bg-red-500/5">
              <p className="text-sm font-semibold">Cancel booking {reference}?</p>
              <textarea
                className={cn(inputStyles, "resize-none text-sm")}
                rows={2}
                placeholder="Reason (shown to the guest on their booking page)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
              {refundable && (
                <fieldset className="space-y-1.5">
                  <legend className="mb-1 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                    Refund {provider === "billplz" ? "(Billplz: you'll refund manually; we'll show the amount)" : "(through Stripe)"}
                  </legend>
                  {options.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 text-sm">
                      <input type="radio" name={`refund-${bookingId}`} checked={mode === o.value} onChange={() => setMode(o.value)} className="size-4 accent-brand-600" />
                      {o.label}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="flex gap-2">
                <Button variant="danger" size="sm" onClick={submit} loading={pending}>
                  Confirm cancellation
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Keep booking
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {result && !open && (
        <p role="status" className="mt-2 text-xs text-zinc-500">
          {result}
        </p>
      )}
    </div>
  );
}

/** Record the security deposit going back to the guest (full or partial with a reason). */
export function DepositReturnButton({
  bookingId,
  depositMajor,
  currencyLabel,
  canRefundOnline,
}: {
  bookingId: string;
  depositMajor: number;
  currencyLabel: string;
  canRefundOnline: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(depositMajor));
  const [note, setNote] = useState("");
  const [online, setOnline] = useState(canRefundOnline);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const partial = Number(amount) < depositMajor;

  const submit = () =>
    startTransition(async () => {
      const res = await recordDepositReturn(bookingId, Number(amount), note, canRefundOnline && online);
      setResult(res.message ?? null);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10"
      >
        <ShieldCheck className="size-4" aria-hidden /> Record deposit return
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-3 space-y-3 rounded-2xl border border-zinc-200/80 bg-zinc-50 p-4 dark:border-zinc-800/80 dark:bg-zinc-900/60">
              <label className="block text-sm font-medium">
                Amount returned ({currencyLabel})
                <input
                  type="number"
                  min={0}
                  max={depositMajor}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(inputStyles, "mt-1 w-40")}
                />
              </label>
              <textarea
                className={cn(inputStyles, "resize-none text-sm")}
                rows={2}
                placeholder={partial ? "Required: what was kept and why (the guest sees this)" : "Note for the guest (optional)"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
                aria-invalid={partial && !note.trim()}
              />
              {canRefundOnline && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={online} onChange={(e) => setOnline(e.target.checked)} className="size-4 accent-brand-600" />
                  Refund it to the guest&rsquo;s card through Stripe
                </label>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={submit} loading={pending} disabled={partial && !note.trim()}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {result && !open && (
        <p role="status" className="mt-2 text-xs text-zinc-500">
          {result}
        </p>
      )}
    </div>
  );
}

/** Public reply under a guest review (empty text removes it). */
export function ReviewReply({ reviewId, initial }: { reviewId: string; initial: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial ?? "");
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const save = () =>
    startTransition(async () => {
      const res = await replyToReview(reviewId, text);
      setResult(res.message ?? null);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  if (!open)
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
          {initial ? "Edit reply" : "Reply publicly"}
        </button>
        {result && <span className="ml-2 text-xs text-zinc-500">{result}</span>}
      </div>
    );
  return (
    <div className="space-y-2">
      <textarea className={cn(inputStyles, "resize-none text-sm")} rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Thank the guest, or respond to feedback. Everyone can see this." />
      <div className="flex gap-2">
        <Button size="sm" onClick={save} loading={pending}>
          Publish reply
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
