import { cn } from "@/lib/utils";

/**
 * Original linework inspired by Malay craft motifs — drawn for InapDesa, not traced:
 *  - AwanDivider: an *awan larat* (cloud-scroll) flourish either side of a lozenge.
 *  - RebungBand:  a repeating *pucuk rebung* (bamboo-shoot) border.
 * Decorative only (aria-hidden). Colour follows `currentColor`; use brass on dark, brass/40 on light.
 */

export function AwanDivider({ className }: { className?: string }) {
  const half = (
    <>
      <path d="M127 12c6 0 10-7 17-5 5 1.5 4 8-1 7.6-3-.3-3-4 0-3.9" />
      <path d="M133 12.4c6 1 12 7.6 20 4.6" />
      <circle cx="157" cy="16" r="1.1" fill="currentColor" stroke="none" />
      <path d="M150 12h90" stroke="url(#awan-fade)" />
    </>
  );
  return (
    <svg viewBox="0 0 240 24" className={cn("h-6 w-60 max-w-full", className)} fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" aria-hidden focusable="false">
      <defs>
        <linearGradient id="awan-fade" x1="150" x2="240" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M120 5.5 126.5 12 120 18.5 113.5 12Z" />
      <path d="M120 9 123 12 120 15 117 12Z" fill="currentColor" stroke="none" />
      <g>{half}</g>
      <g transform="matrix(-1 0 0 1 240 0)">{half}</g>
    </svg>
  );
}

export function RebungBand({ className }: { className?: string }) {
  return (
    <svg className={cn("h-3 w-full", className)} preserveAspectRatio="none" aria-hidden focusable="false">
      <defs>
        <pattern id="rebung" width="16" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 12 8 1l8 11M4.5 12 8 6.5l3.5 5.5" fill="none" stroke="currentColor" strokeWidth="0.9" strokeLinejoin="round" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#rebung)" />
    </svg>
  );
}

/** Eyebrow label + serif heading pair used across the heritage pages. */
export function DisplayHeading({
  eyebrow,
  title,
  as: Tag = "h2",
  id,
  className,
  tone = "light",
}: {
  eyebrow?: string;
  title: string;
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <div className={className}>
      {eyebrow && <p className={cn("eyebrow", tone === "dark" && "text-brass-light")}>{eyebrow}</p>}
      <Tag id={id} className={cn("display mt-2 text-3xl text-balance sm:text-[2.6rem]", tone === "dark" && "text-ivory")}>
        {title}
      </Tag>
    </div>
  );
}
