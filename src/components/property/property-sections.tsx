"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Languages, MessageCircle } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { useT } from "@/components/i18n/locale";
import { amenityLabel, getAmenity } from "@/lib/amenities";
import { cn, initials } from "@/lib/utils";

export function AmenityList({ amenities }: { amenities: string[] }) {
  const t = useT();
  const [showAll, setShowAll] = useState(false);
  const LIMIT = 8;
  const visible = showAll ? amenities : amenities.slice(0, LIMIT);

  return (
    <div>
      <ul className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {visible.map((key) => {
            const a = getAmenity(key);
            const Icon = a.icon;
            return (
              <motion.li
                key={key}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-paper px-3.5 py-2 text-sm font-medium shadow-[0_1px_2px_rgb(15_23_42/0.04)] dark:border-zinc-800/80 dark:bg-zinc-900"
              >
                <Icon className="size-4 text-brass-ink dark:text-brass-light" aria-hidden />
                {amenityLabel(a, t.locale)}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {amenities.length > LIMIT && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-4 text-sm font-semibold underline underline-offset-4">
          {showAll ? t("amenities.showFewer") : t("amenities.showAll", { n: amenities.length })}
        </button>
      )}
    </div>
  );
}

export function ExpandableText({ text, editorial }: { text: string; editorial?: boolean }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 420;
  return (
    <div>
      <p
        className={cn(
          "whitespace-pre-line text-zinc-700 dark:text-zinc-300",
          editorial ? "drop-cap text-[17px] leading-8" : "text-[15px] leading-7",
          !expanded && long && (editorial ? "line-clamp-[8]" : "line-clamp-5"),
        )}
      >
        {text}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-3 text-sm font-semibold underline underline-offset-4">
          {expanded ? t("text.showLess") : t("text.readMore")}
        </button>
      )}
    </div>
  );
}

interface HostCardProps {
  name: string;
  bio: string | null;
  avatarUrl: string | null;
  languages: string[];
  hostSince: string | null;
  whatsappHref: string | null;
}

export function HostCard({ name, bio, avatarUrl, languages, hostSince, whatsappHref }: HostCardProps) {
  const t = useT();
  const since = hostSince ? new Date(`${hostSince}T00:00:00Z`).getUTCFullYear() : null;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 p-6">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-800 ring-2 ring-brass/50 ring-offset-2 ring-offset-paper dark:ring-offset-zinc-900">
          {avatarUrl ? (
            <Image src={avatarUrl} alt={name} fill sizes="64px" className="object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-lg font-semibold text-white">{initials(name)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-display text-2xl leading-tight font-semibold">
            {t("host.hostedBy", { name })}
          </p>
          <p className="text-sm text-zinc-500">{since ? t("host.since", { year: since }) : t("host.private")}</p>
        </div>
      </div>
      {bio && <p className="border-t border-zinc-200/80 px-6 py-5 text-[15px] leading-7 text-zinc-700 dark:border-zinc-800/80 dark:text-zinc-300">{bio}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 px-6 py-4 dark:border-zinc-800/80">
        {languages.length > 0 ? (
          <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <Languages className="size-4" aria-hidden />
            {t("host.speaks", { langs: languages.join(", ") })}
          </p>
        ) : (
          <span />
        )}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 px-3.5 py-2 text-sm font-semibold transition hover:border-zinc-300 hover:shadow-soft dark:border-zinc-800/80"
          >
            <MessageCircle className="size-4 text-[#25D366]" aria-hidden />
            {t("host.message")}
          </a>
        )}
      </div>
    </div>
  );
}
