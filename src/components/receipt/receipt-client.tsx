"use client";

import { CalendarPlus, Check, Copy, LoaderCircle, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n/locale";

export function QrPass({ value, reference }: { value: string; reference: string }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-2xl bg-paper p-4 shadow-soft ring-1 ring-zinc-200/80">
        <QRCodeSVG value={value} size={176} level="M" marginSize={0} fgColor="#0f172a" title={t("rc.passTitle", { ref: reference })} />
      </div>
      <p className="mt-3 font-mono text-lg font-semibold tracking-[0.2em]">{reference}</p>
      <p className="text-xs text-zinc-500">{t("rc.showAtCheckIn")}</p>
    </div>
  );
}

/** Refreshes the server component until the payment is confirmed (webhook or sync). */
export function PaymentStatusPoller({ intervalMs = 2500, maxAttempts = 24 }: { intervalMs?: number; maxAttempts?: number }) {
  const t = useT();
  const router = useRouter();
  const attempts = useRef(0);
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      attempts.current += 1;
      if (attempts.current > maxAttempts) {
        clearInterval(t);
        setGaveUp(true);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs, maxAttempts]);

  return (
    <p className="mt-4 inline-flex items-center gap-2 text-sm text-zinc-500" aria-live="polite">
      {gaveUp ? (
        t("rc.stillProcessing")
      ) : (
        <>
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> {t("rc.confirmingShort")}
        </>
      )}
    </p>
  );
}

interface ReceiptActionsProps {
  title: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  location: string;
  timeZone: string;
}

export function ReceiptActions(props: ReceiptActionsProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const downloadIcs = () => {
    const stamp = (date: string, time: string) => `${date.replace(/-/g, "")}T${time.slice(0, 5).replace(":", "")}00`;
    const esc = (s: string) => s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//InapDesa//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${props.reference}@inapdesa`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;TZID=${props.timeZone}:${stamp(props.checkIn, props.checkInTime)}`,
      `DTEND;TZID=${props.timeZone}:${stamp(props.checkOut, props.checkOutTime)}`,
      `SUMMARY:${esc(`Stay at ${props.title}`)}`,
      `LOCATION:${esc(props.location)}`,
      `DESCRIPTION:${esc(`Booking ${props.reference}\n${window.location.href}`)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${props.reference}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const btn =
    "inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-paper px-3.5 py-2 text-sm font-semibold transition hover:shadow-soft dark:border-zinc-800/80 dark:bg-zinc-900";
  return (
    <div className="no-print flex flex-wrap gap-2">
      <button type="button" onClick={downloadIcs} className={btn}>
        <CalendarPlus className="size-4" aria-hidden /> {t("rc.addCalendar")}
      </button>
      <button type="button" onClick={() => window.print()} className={btn}>
        <Printer className="size-4" aria-hidden /> {t("rc.print")}
      </button>
      <button type="button" onClick={copyLink} className={btn}>
        {copied ? <Check className="size-4 text-brand-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? t("rc.copied") : t("rc.copyLink")}
      </button>
    </div>
  );
}
