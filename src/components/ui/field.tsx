import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const inputStyles = cn(
  "block w-full rounded-xl border border-zinc-200/80 bg-paper px-3.5 py-2.5 text-[15px] text-ink shadow-[0_1px_2px_rgb(15_23_42/0.04)]",
  "placeholder:text-zinc-400 transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none",
  "aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-500/15",
  "dark:border-zinc-800/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500",
);

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function SectionCard({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5 sm:p-6", className)}>
      <div className="mb-5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}
