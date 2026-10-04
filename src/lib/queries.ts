import "server-only";

import { cache } from "react";
import { addDays, todayInTimeZone, type ISODate } from "@/lib/dates";
import type { Tables } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

export type Property = Tables<"properties">;
export type PropertyImage = Tables<"property_images">;
export type PropertyWithImages = Property & { images: PropertyImage[] };

export interface Availability {
  /** Nights taken by confirmed bookings or active checkout holds. */
  booked: ISODate[];
  /** Nights closed by the host. */
  blocked: ISODate[];
  /** First day returned (property-local "today"). */
  from: ISODate;
  /** Exclusive end of the window. */
  to: ISODate;
}

const AVAILABILITY_WINDOW_DAYS = 400;

export async function getPublishedProperties(): Promise<PropertyWithImages[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*, images:property_images(*)")
    .eq("is_published", true)
    .order("created_at", { ascending: true })
    .order("sort_order", { referencedTable: "property_images", ascending: true });
  if (error) throw new Error(`Failed to load properties: ${error.message}`);
  return (data ?? []) as PropertyWithImages[];
}

/** Cached per request so generateMetadata and the page share one query. */
export const getPropertyBySlug = cache(async (slug: string): Promise<PropertyWithImages | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*, images:property_images(*)")
    .eq("slug", slug)
    .order("sort_order", { referencedTable: "property_images", ascending: true })
    .maybeSingle();
  if (error) throw new Error(`Failed to load property: ${error.message}`);
  return (data as PropertyWithImages | null) ?? null;
});

export async function getAvailability(property: Pick<Property, "id" | "timezone">): Promise<Availability> {
  const supabase = await createClient();
  const from = todayInTimeZone(property.timezone);
  const to = addDays(from, AVAILABILITY_WINDOW_DAYS);
  const { data, error } = await supabase.rpc("get_unavailable_dates", {
    p_property_id: property.id,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`Failed to load availability: ${error.message}`);
  const booked: ISODate[] = [];
  const blocked: ISODate[] = [];
  for (const row of data ?? []) {
    (row.kind === "blocked" ? blocked : booked).push(row.day);
  }
  return { booked, blocked, from, to };
}
