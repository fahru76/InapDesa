import { formatDateLong, formatTime, type ISODate } from "./dates";
import { formatMoney } from "./pricing";

export type MessageTemplate = "confirmation" | "pre_arrival" | "balance_reminder" | "thank_you";

export interface MessageContext {
  guestName: string;
  guestPhone: string; // E.164
  reference: string;
  propertyTitle: string;
  checkIn: ISODate;
  checkOut: ISODate;
  checkInTime: string;
  checkOutTime: string;
  balanceDue: number;
  amountPaid: number;
  totalAmount: number;
  currency: string;
  address: string | null;
  receiptUrl: string;
  hostName: string | null;
}

export const TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  confirmation: "Booking confirmed",
  pre_arrival: "Arrival details",
  balance_reminder: "Balance reminder",
  thank_you: "Thank you",
};

export function renderMessage(template: MessageTemplate, c: MessageContext): string {
  const first = c.guestName.split(" ")[0] ?? c.guestName;
  const outstanding = Math.max(0, c.totalAmount - c.amountPaid);
  const sign = c.hostName ? `\n\n— ${c.hostName}` : "";

  switch (template) {
    case "confirmation":
      return (
        `Hi ${first}! Your stay at ${c.propertyTitle} is confirmed ✅\n\n` +
        `Booking: ${c.reference}\n` +
        `Check-in: ${formatDateLong(c.checkIn)} from ${formatTime(c.checkInTime)}\n` +
        `Check-out: ${formatDateLong(c.checkOut)} by ${formatTime(c.checkOutTime)}\n` +
        (outstanding > 0 ? `Balance due on arrival: ${formatMoney(outstanding, c.currency)}\n` : "Fully paid — nothing due on arrival.\n") +
        `\nYour check-in pass: ${c.receiptUrl}` +
        sign
      );
    case "pre_arrival":
      return (
        `Hi ${first}, we're looking forward to hosting you at ${c.propertyTitle} on ${formatDateLong(c.checkIn)}.\n\n` +
        `Check-in opens at ${formatTime(c.checkInTime)}.` +
        (c.address ? `\nAddress: ${c.address}` : "") +
        `\n\nPlease have your QR pass ready: ${c.receiptUrl}\nReply here with your estimated arrival time 🙏` +
        sign
      );
    case "balance_reminder":
      return (
        `Hi ${first}, a friendly reminder that ${formatMoney(outstanding, c.currency)} is due at check-in for booking ${c.reference} ` +
        `(${formatDateLong(c.checkIn)}). Cash, DuitNow QR or card are all fine.` +
        sign
      );
    case "thank_you":
      return (
        `Terima kasih ${first}! Thank you for staying at ${c.propertyTitle}. ` +
        `We hope to welcome you back soon — book direct anytime for our best rate.` +
        sign
      );
  }
}

export function whatsappLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`;
}

/** `sms:` URI that works on both iOS and Android. */
export function smsLink(phoneE164: string, text: string): string {
  return `sms:${phoneE164}?&body=${encodeURIComponent(text)}`;
}

/** Suggest the most relevant template for where the booking is in its lifecycle. */
export function suggestedTemplate(status: string, checkIn: ISODate, today: ISODate): MessageTemplate {
  if (status === "checked_in" || status === "completed") return "thank_you";
  const daysOut = (Date.parse(checkIn) - Date.parse(today)) / 86_400_000;
  if (daysOut <= 2) return "pre_arrival";
  if (status === "confirmed" && daysOut <= 7) return "balance_reminder";
  return "confirmation";
}
