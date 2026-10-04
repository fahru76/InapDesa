import type { BookingStatus } from "@/lib/database.types";
import { cn } from "@/lib/utils";

const STYLES: Record<BookingStatus, { label: string; className: string; dot: string }> = {
  pending_payment: { label: "Awaiting payment", className: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20", dot: "bg-amber-500" },
  confirmed: { label: "Deposit paid", className: "bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20", dot: "bg-brand-500" },
  paid_in_full: { label: "Paid in full", className: "bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20", dot: "bg-brand-600" },
  checked_in: { label: "Checked in", className: "bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20", dot: "bg-sky-500" },
  completed: { label: "Completed", className: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700", dot: "bg-zinc-400" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20", dot: "bg-red-500" },
  expired: { label: "Hold expired", className: "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700", dot: "bg-zinc-400" },
};

export function statusLabel(status: BookingStatus): string {
  return STYLES[status].label;
}

export function StatusBadge({ status, className, label }: { status: BookingStatus; className?: string; label?: string }) {
  const s = STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", s.className, className)}>
      <span className={cn("size-1.5 rounded-full", s.dot)} aria-hidden />
      {label ?? s.label}
    </span>
  );
}
