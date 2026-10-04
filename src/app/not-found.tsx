import Link from "next/link";
import { buttonStyles } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-zinc-600 dark:text-zinc-400">The link may be incomplete, or the booking pass has a different access token.</p>
      <Link href="/" className={buttonStyles({ className: "mt-8" })}>
        Browse stays
      </Link>
    </div>
  );
}
