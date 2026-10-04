import "server-only";

import { isCancellationPreset, refundSchedule, splitPaid } from "./cancellation";
import type { NotificationKind, Tables } from "./database.types";
import { formatDateLong, formatTime } from "./dates";
import { emailConfigured, escapeHtml, sendEmail } from "./email";
import { publicEnv } from "./env";
import { formatMoney } from "./pricing";
import { createAdminClient } from "./supabase/server";
import { log } from "@/lib/log";

type B = Tables<"bookings"> & { property: Tables<"properties"> };

const COPY = {
  en: {
    hi: (n: string) => `Hi ${n},`,
    subject: {
      confirmation: (t: string) => `Booking confirmed — ${t}`,
      arrival_7d: (t: string) => `One week to go — ${t}`,
      arrival_1d: (t: string) => `See you soon at ${t}`,
      review_invite: (t: string) => `How was your stay at ${t}?`,
    },
    intro: {
      confirmation: (t: string) => `Your stay at ${t} is confirmed. Everything you need is below and on your booking pass.`,
      arrival_7d: (t: string) => `Your stay at ${t} is about a week away. Here are your arrival details.`,
      arrival_1d: (t: string) => `Your stay at ${t} starts very soon. Here's everything for check-in.`,
      review_invite: (t: string) => `Thank you for staying at ${t}. A short review helps other guests and your host.`,
    },
    dates: "Dates",
    checkIn: "Check-in",
    checkOut: "Check-out",
    from: (t: string) => `from ${t}`,
    by: (t: string) => `by ${t}`,
    address: "Address",
    paid: "Paid",
    balance: "Balance due",
    balanceNote: "Pay it online from your booking pass, or at check-in.",
    cancel: "Cancellation",
    freeUntil: (d: string, a: string) => `Cancel by ${d} for a refund of ${a}.`,
    noRefund: "Stay charges are non-refundable.",
    cta: "Open your booking pass",
    ctaReview: "Write a review",
    host: (n: string, p: string) => `Questions? Message ${n} on WhatsApp: ${p}`,
    ref: (r: string) => `Booking ${r}`,
  },
  ms: {
    hi: (n: string) => `Hai ${n},`,
    subject: {
      confirmation: (t: string) => `Tempahan disahkan — ${t}`,
      arrival_7d: (t: string) => `Seminggu lagi — ${t}`,
      arrival_1d: (t: string) => `Jumpa tidak lama lagi di ${t}`,
      review_invite: (t: string) => `Bagaimana penginapan anda di ${t}?`,
    },
    intro: {
      confirmation: (t: string) => `Penginapan anda di ${t} telah disahkan. Semua maklumat ada di bawah dan pada pas tempahan anda.`,
      arrival_7d: (t: string) => `Penginapan anda di ${t} lebih kurang seminggu lagi. Ini butiran ketibaan anda.`,
      arrival_1d: (t: string) => `Penginapan anda di ${t} bermula tidak lama lagi. Ini semua maklumat daftar masuk.`,
      review_invite: (t: string) => `Terima kasih kerana menginap di ${t}. Ulasan ringkas membantu tetamu lain dan hos anda.`,
    },
    dates: "Tarikh",
    checkIn: "Daftar masuk",
    checkOut: "Daftar keluar",
    from: (t: string) => `dari ${t}`,
    by: (t: string) => `sebelum ${t}`,
    address: "Alamat",
    paid: "Telah dibayar",
    balance: "Baki perlu dibayar",
    balanceNote: "Bayar dalam talian melalui pas tempahan anda, atau semasa daftar masuk.",
    cancel: "Pembatalan",
    freeUntil: (d: string, a: string) => `Batalkan sebelum ${d} untuk bayaran balik ${a}.`,
    noRefund: "Caj penginapan tidak dikembalikan.",
    cta: "Buka pas tempahan anda",
    ctaReview: "Tulis ulasan",
    host: (n: string, p: string) => `Ada soalan? Hubungi ${n} di WhatsApp: ${p}`,
    ref: (r: string) => `Tempahan ${r}`,
  },
} as const;

export function renderBookingEmail(kind: NotificationKind, b: B): { subject: string; html: string; text: string } {
  const locale = b.locale === "ms" ? "ms" : "en";
  const c = COPY[locale];
  const p = b.property;
  const first = b.guest_name.split(" ")[0] || b.guest_name;
  const passUrl = `${publicEnv.siteUrl}/booking/${b.id}?token=${b.access_token}${kind === "review_invite" ? "#review" : ""}`;
  const outstanding = Math.max(0, b.total_amount - b.amount_paid);
  const address = [p.address_line, p.city, p.region].filter(Boolean).join(", ");

  const rows: [string, string][] = [];
  if (kind !== "review_invite") {
    rows.push([c.checkIn, `${formatDateLong(b.check_in, locale)}, ${c.from(formatTime(p.check_in_time, locale))}`]);
    rows.push([c.checkOut, `${formatDateLong(b.check_out, locale)}, ${c.by(formatTime(p.check_out_time, locale))}`]);
    if (address) rows.push([c.address, address]);
    rows.push([c.paid, formatMoney(b.amount_paid, b.currency)]);
    if (outstanding > 0) rows.push([c.balance, `${formatMoney(outstanding, b.currency)} — ${c.balanceNote}`]);
  }
  if (kind === "confirmation" && isCancellationPreset(b.cancellation_preset) && b.cancellation_preset !== "custom") {
    const steps = refundSchedule(b.cancellation_preset, b.check_in, p.check_in_time, splitPaid(b));
    const firstRefund = steps.find((s) => s.until && s.refund > 0);
    rows.push([
      c.cancel,
      firstRefund?.until ? c.freeUntil(`${formatDateLong(firstRefund.until.date, locale)} ${formatTime(firstRefund.until.time, locale)}`, formatMoney(firstRefund.refund, b.currency)) : c.noRefund,
    ]);
  }

  const subject = c.subject[kind](p.title);
  const intro = c.intro[kind](p.title);
  const cta = kind === "review_invite" ? c.ctaReview : c.cta;
  const hostLine = p.host_phone && p.host_display_name ? c.host(p.host_display_name, p.host_phone) : null;

  const text = [
    c.hi(first),
    "",
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    `${cta}: ${passUrl}`,
    hostLine ? `\n${hostLine}` : "",
    "",
    c.ref(b.reference),
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;background:#f7f2e9;font-family:Helvetica,Arial,sans-serif;color:#1c1712">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f2e9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fffcf6;border:1px solid #e9e0d0;border-radius:16px;overflow:hidden">
<tr><td style="background:#1c1712;padding:22px 28px;color:#f7f2e9;font-family:Georgia,serif;font-size:22px">${escapeHtml(p.title)}</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px;font-size:16px">${escapeHtml(c.hi(first))}</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#443d33">${escapeHtml(intro)}</p>
${rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e9e0d0;margin-bottom:22px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 12px 10px 0;border-bottom:1px solid #e9e0d0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7a5f35;vertical-align:top;white-space:nowrap">${escapeHtml(k)}</td><td style="padding:10px 0;border-bottom:1px solid #e9e0d0;font-size:14px;line-height:1.5">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>` : ""}
<a href="${escapeHtml(passUrl)}" style="display:inline-block;background:#2f5d46;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:12px;font-size:15px">${escapeHtml(cta)}</a>
${hostLine ? `<p style="margin:22px 0 0;font-size:13px;color:#5b5245">${escapeHtml(hostLine)}</p>` : ""}
<p style="margin:18px 0 0;font-size:12px;color:#776c5d">${escapeHtml(c.ref(b.reference))}</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, html, text };
}

export type NotifyOutcome = "sent" | "already_sent" | "not_configured" | "failed" | "not_found";

/** Send a booking email at most once. The log row is claimed first, and released if sending fails, so a retry can try again. */
export async function sendBookingNotification(bookingId: string, kind: NotificationKind): Promise<NotifyOutcome> {
  if (!emailConfigured()) return "not_configured";
  const db = createAdminClient();
  const { error: claimErr } = await db.from("booking_notifications").insert({ booking_id: bookingId, kind });
  if (claimErr) {
    if (claimErr.code === "23505") return "already_sent";
    log.error("notify.claim-failed", { bookingId, kind, err: claimErr.message });
    return "failed";
  }
  const { data } = await db.from("bookings").select("*, property:properties(*)").eq("id", bookingId).maybeSingle();
  const booking = data as B | null;
  if (!booking) {
    await db.from("booking_notifications").delete().eq("booking_id", bookingId).eq("kind", kind);
    return "not_found";
  }
  const email = renderBookingEmail(kind, booking);
  const result = await sendEmail({ to: booking.guest_email, ...email });
  if (!result.sent) {
    await db.from("booking_notifications").delete().eq("booking_id", bookingId).eq("kind", kind);
    return "failed";
  }
  return "sent";
}
