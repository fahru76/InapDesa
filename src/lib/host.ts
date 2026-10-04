import "server-only";

import { cache } from "react";
import type { Tables } from "@/lib/database.types";
import { publicEnv } from "@/lib/env";
import type { MessageContext } from "@/lib/messaging";
import { requireUser } from "@/lib/supabase/server";

export type HostProperty = Tables<"properties">;
export type HostBooking = Tables<"bookings">;

/** Loads the signed-in host and their properties. `?property=<id>` selects one; defaults to the first. */
export const getHostContext = cache(async (propertyId?: string) => {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.from("properties").select("*").eq("host_id", user.id).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const properties = data ?? [];
  const property = properties.find((p) => p.id === propertyId) ?? properties[0] ?? null;
  return { supabase, user, properties, property };
});

export function receiptUrl(b: Pick<HostBooking, "id" | "access_token">): string {
  return `${publicEnv.siteUrl}/booking/${b.id}?token=${b.access_token}`;
}

export function messageContext(b: HostBooking, p: HostProperty): MessageContext {
  return {
    guestName: b.guest_name,
    guestPhone: b.guest_phone,
    reference: b.reference,
    propertyTitle: p.title,
    checkIn: b.check_in,
    checkOut: b.check_out,
    checkInTime: p.check_in_time,
    checkOutTime: p.check_out_time,
    balanceDue: b.balance_due,
    amountPaid: b.amount_paid,
    totalAmount: b.total_amount,
    currency: b.currency,
    address: [p.address_line, p.city, p.region].filter(Boolean).join(", ") || null,
    receiptUrl: receiptUrl(b),
    hostName: p.host_display_name,
  };
}

export function withProperty(path: string, propertyId: string | undefined | null): string {
  if (!propertyId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}property=${propertyId}`;
}
