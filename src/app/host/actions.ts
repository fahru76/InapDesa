"use server";

import { revalidatePath } from "next/cache";
import { refundStripePayments } from "@/lib/booking-service";
import { syncPropertyFeeds } from "@/lib/calendar-sync";
import { isCancellationPreset, refundAt, splitPaid } from "@/lib/cancellation";
import { diffDays, eachNight, isISODate } from "@/lib/dates";
import { checkFeedUrl } from "@/lib/net-guard";
import { formatMoney, toMinor } from "@/lib/pricing";
import { createAdminClient, requireUser } from "@/lib/supabase/server";
import { contentSchema, type ContentInput } from "@/lib/content";
import { feedSchema, propertyFormToObject, propertySettingsSchema } from "@/lib/validation";
import { log } from "@/lib/log";

export interface ActionResult {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  propertyId?: string;
}

function revalidateHost(slug?: string) {
  revalidatePath("/host", "layout");
  revalidatePath("/");
  if (slug) revalidatePath(`/stays/${slug}`);
}

// ─── Property settings ─────────────────────────────────────────────────────

export async function saveProperty(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = propertySettingsSchema.safeParse(propertyFormToObject(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, message: "Please fix the highlighted fields.", errors };
  }

  const v = parsed.data;
  const row = {
    slug: v.slug,
    title: v.title,
    address_line: v.address_line,
    city: v.city,
    region: v.region,
    country: v.country,
    bedrooms: v.bedrooms,
    beds: v.beds,
    bathrooms: v.bathrooms,
    max_guests: v.max_guests,
    max_infants: v.max_infants,
    check_in_time: v.check_in_time,
    check_out_time: v.check_out_time,
    currency: v.currency,
    weekday_rate: toMinor(v.weekday_rate, v.currency),
    weekend_rate: toMinor(v.weekend_rate, v.currency),
    weekend_days: v.weekend_days,
    cleaning_fee: toMinor(v.cleaning_fee, v.currency),
    security_deposit: toMinor(v.security_deposit, v.currency),
    min_nights: v.min_nights,
    max_nights: v.max_nights,
    payment_policy: v.payment_policy,
    deposit_percent: v.payment_policy === "full" ? 100 : v.deposit_percent,
    amenities: v.amenities,
    host_phone: v.host_phone,
    is_published: v.is_published,
    billplz_enabled: v.billplz_enabled,
    cancellation_preset: v.cancellation_preset,
    security_deposit_return_days: v.security_deposit_return_days,
    tourism_tax_enabled: v.tourism_tax_enabled,
    tourism_tax_rate: toMinor(v.tourism_tax_rate, v.currency),
    tourism_tax_rooms: v.tourism_tax_rooms,
  };

  const id = String(formData.get("id") ?? "");
  const result = id
    ? await supabase.from("properties").update(row).eq("id", id).eq("host_id", user.id).select("id, slug").single()
    : await supabase
        .from("properties")
        .insert({ ...row, host_id: user.id })
        .select("id, slug")
        .single();

  if (result.error) {
    if (result.error.code === "23505") return { ok: false, message: "That URL slug is taken.", errors: { slug: "Already in use — try another." } };
    return { ok: false, message: result.error.message };
  }

  revalidateHost(result.data.slug);
  return { ok: true, message: id ? "Changes saved." : "Property created.", propertyId: result.data.id };
}

// ─── Availability ──────────────────────────────────────────────────────────

export async function setBlockedRange(propertyId: string, from: string, to: string, blocked: boolean, reason?: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!isISODate(from) || !isISODate(to) || to < from) return { ok: false, message: "Invalid date range." };
  if (diffDays(from, to) > 366) return { ok: false, message: "Select at most one year at a time." };

  const days = [...eachNight(from, to), to]; // inclusive range
  if (blocked) {
    const { error } = await supabase.from("blocked_dates").upsert(
      days.map((date) => ({ property_id: propertyId, date, reason: reason?.slice(0, 200) || null })),
      { onConflict: "property_id,date", ignoreDuplicates: true },
    );
    if (error) return { ok: false, message: error.message };
  } else {
    // Only nights the host closed; nights imported from another platform stay closed until that platform frees them.
    const { error } = await supabase.from("blocked_dates").delete().eq("property_id", propertyId).is("feed_id", null).gte("date", from).lte("date", to);
    if (error) return { ok: false, message: error.message };
  }
  revalidatePath("/host/calendar");
  const { data: prop } = await supabase.from("properties").select("slug").eq("id", propertyId).maybeSingle();
  if (prop) revalidatePath(`/stays/${prop.slug}`);
  return { ok: true, message: `${days.length} night${days.length > 1 ? "s" : ""} ${blocked ? "closed" : "opened"}.` };
}

// ─── Booking operations ────────────────────────────────────────────────────

export async function checkInBooking(bookingId: string, balanceCollected: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("host_check_in_booking", { p_booking_id: bookingId, p_balance_collected: balanceCollected });
  if (error) return { ok: false, message: error.message };
  revalidateHost();
  return { ok: true, message: "Guest checked in." };
}

export type RefundMode = "policy" | "full" | "none";

export async function cancelBooking(bookingId: string, reason: string, mode: RefundMode): Promise<ActionResult> {
  const { supabase } = await requireUser();
  // Ownership + status rules are enforced inside the SECURITY DEFINER function.
  const { data: booking, error } = await supabase.rpc("host_cancel_booking", { p_booking_id: bookingId, p_reason: reason });
  if (error) return { ok: false, message: error.message };

  const db = createAdminClient();
  const [{ data: property }, { data: refunds }] = await Promise.all([
    db.from("properties").select("check_in_time, timezone").eq("id", booking.property_id).single(),
    db.from("transactions").select("amount").eq("booking_id", booking.id).eq("kind", "refund").eq("status", "succeeded"),
  ]);
  const alreadyRefunded = (refunds ?? []).reduce((sum, r) => sum + r.amount, 0);
  const refundable = Math.max(0, booking.amount_paid - alreadyRefunded);

  let target = 0;
  if (mode === "full") target = refundable;
  if (mode === "policy") {
    const preset = isCancellationPreset(booking.cancellation_preset) ? booking.cancellation_preset : "custom";
    const due = property ? refundAt(preset, booking.check_in, property.check_in_time, property.timezone, splitPaid(booking)) : null;
    target = Math.min(refundable, due ? due.refund : refundable);
  }

  let message = "Booking cancelled.";
  if (target > 0) {
    const money = formatMoney(target, booking.currency);
    if (booking.payment_provider === "billplz" && !booking.stripe_payment_intent_id) {
      message = `Booking cancelled. Refund ${money} from your Billplz dashboard or by bank transfer.`;
    } else {
      try {
        const done = await refundStripePayments(booking, target);
        message = done >= target ? `Booking cancelled and ${money} refunded.` : `Booking cancelled. Refunded ${formatMoney(done, booking.currency)}; refund the rest (${formatMoney(target - done, booking.currency)}) manually.`;
      } catch (err) {
        log.error("host.refund-failed", { bookingId: booking.id, amount: target, err });
        message = `Booking cancelled, but the refund of ${money} failed. Issue it from the Stripe dashboard.`;
      }
    }
  } else if (mode !== "none" && refundable > 0) {
    message = "Booking cancelled. Under your cancellation policy no refund is due.";
  }
  revalidateHost();
  return { ok: true, message };
}

/** Record how much of the security deposit went back. Optionally refund it through Stripe when it was paid online. */
export async function recordDepositReturn(bookingId: string, amountMajor: number, note: string, refundOnline: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: current, error: readErr } = await supabase.from("bookings").select("currency").eq("id", bookingId).maybeSingle();
  if (readErr || !current) return { ok: false, message: "Booking not found." };
  const amount = toMinor(Number(amountMajor) || 0, current.currency);
  const { data: booking, error } = await supabase.rpc("host_record_deposit_return", { p_booking_id: bookingId, p_amount: amount, p_note: note });
  if (error) return { ok: false, message: error.message };

  let message = `Recorded: ${formatMoney(amount, booking.currency)} of the security deposit returned.`;
  if (refundOnline && amount > 0) {
    try {
      const done = await refundStripePayments(booking, amount);
      message = done >= amount ? `${formatMoney(done, booking.currency)} refunded to the guest's card.` : `Refunded ${formatMoney(done, booking.currency)} online; return the rest by bank transfer.`;
    } catch (err) {
      log.error("host.deposit-refund-failed", { bookingId, amount, err });
      message = "Recorded, but the online refund failed. Return it by bank transfer or from the Stripe dashboard.";
    }
  }
  revalidateHost();
  return { ok: true, message };
}

// ─── Reviews ───────────────────────────────────────────────────────────────

export async function replyToReview(reviewId: string, reply: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("host_reply_review", { p_review_id: reviewId, p_reply: reply });
  if (error) return { ok: false, message: error.message };
  revalidateHost();
  return { ok: true, message: reply.trim() ? "Reply published." : "Reply removed." };
}

// ─── Calendar sync ─────────────────────────────────────────────────────────

/** Secret export link for this listing (created on first use). */
export async function getCalendarExportToken(propertyId: string): Promise<string | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("property_private").select("ical_export_token").eq("property_id", propertyId).maybeSingle();
  if (data) return data.ical_export_token;
  const { data: created, error } = await supabase.from("property_private").insert({ property_id: propertyId }).select("ical_export_token").single();
  if (error) return null;
  return created.ical_export_token;
}

export async function regenerateCalendarExport(propertyId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("property_private").upsert({ property_id: propertyId, ical_export_token: crypto.randomUUID() });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/host/calendar");
  return { ok: true, message: "New link created. Update it on Airbnb, Agoda and Booking.com — the old link stops working." };
}

export async function addCalendarFeed(input: { propertyId: string; name: string; url: string }): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const parsed = feedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the details." };
  const checked = checkFeedUrl(parsed.data.url);
  if (!checked.ok) return { ok: false, message: checked.reason };
  const { data: feed, error } = await supabase
    .from("calendar_feeds")
    .insert({ property_id: parsed.data.propertyId, name: parsed.data.name, url: checked.url.toString() })
    .select("id")
    .single();
  if (error) return { ok: false, message: error.code === "23505" ? "That calendar is already connected." : error.message };
  const [result] = await syncPropertyFeeds(parsed.data.propertyId, { maxAgeMinutes: 0 }).then((r) => r.filter((x) => x.feedId === feed.id));
  revalidateCalendar(parsed.data.propertyId);
  if (result && !result.ok) return { ok: false, message: `Saved, but the first sync failed: ${result.error}` };
  return { ok: true, message: result ? `Connected. ${result.nights} night${result.nights === 1 ? "" : "s"} imported.` : "Connected." };
}

export async function removeCalendarFeed(feedId: string, propertyId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("calendar_feeds").delete().eq("id", feedId);
  if (error) return { ok: false, message: error.message };
  revalidateCalendar(propertyId);
  return { ok: true, message: "Calendar disconnected; its imported nights are open again." };
}

export async function syncCalendarsNow(propertyId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: feeds } = await supabase.from("calendar_feeds").select("id, last_synced_at").eq("property_id", propertyId);
  if (!feeds?.length) return { ok: false, message: "No calendars connected yet." };
  // Gentle rate limit: once a minute.
  const recent = feeds.every((f) => f.last_synced_at && Date.now() - new Date(f.last_synced_at).getTime() < 60_000);
  if (recent) return { ok: false, message: "Synced less than a minute ago — try again shortly." };
  const results = await syncPropertyFeeds(propertyId, { maxAgeMinutes: 1 });
  revalidateCalendar(propertyId);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) return { ok: false, message: `${results.length - failed.length} synced, ${failed.length} failed: ${failed[0]?.error ?? ""}` };
  return { ok: true, message: `All calendars synced (${results.reduce((s, r) => s + r.nights, 0)} imported nights).` };
}

function revalidateCalendar(propertyId: string) {
  revalidatePath("/host/calendar");
  void createAdminClient()
    .from("properties")
    .select("slug")
    .eq("id", propertyId)
    .maybeSingle()
    .then(({ data }) => data && revalidatePath(`/stays/${data.slug}`));
}

// ─── Photos ────────────────────────────────────────────────────────────────

export async function addPropertyImage(propertyId: string, storagePath: string, url: string, alt: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  if (!storagePath.startsWith(`${propertyId}/`)) return { ok: false, message: "Invalid upload path." };
  const { data: last } = await supabase
    .from("property_images")
    .select("sort_order")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("property_images").insert({
    property_id: propertyId,
    storage_path: storagePath,
    url,
    alt: alt.slice(0, 200),
    sort_order: (last?.sort_order ?? -1) + 1,
  });
  if (error) return { ok: false, message: error.message };
  revalidateHost(await slugFor(propertyId));
  return { ok: true };
}

export async function deletePropertyImage(imageId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: img, error } = await supabase.from("property_images").select("*").eq("id", imageId).maybeSingle();
  if (error || !img) return { ok: false, message: "Photo not found." };
  if (img.storage_path) await supabase.storage.from("property-images").remove([img.storage_path]);
  const { error: delErr } = await supabase.from("property_images").delete().eq("id", imageId);
  if (delErr) return { ok: false, message: delErr.message };
  revalidateHost(await slugFor(img.property_id));
  return { ok: true };
}

export async function updateImageAlt(imageId: string, alt: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("property_images").update({ alt: alt.slice(0, 200) }).eq("id", imageId).select("property_id").single();
  if (error) return { ok: false, message: error.message };
  revalidateHost(await slugFor(data.property_id));
  return { ok: true };
}

export async function setCoverImage(imageId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data: img } = await supabase.from("property_images").select("property_id").eq("id", imageId).maybeSingle();
  if (!img) return { ok: false, message: "Photo not found." };
  const { data: all, error } = await supabase.from("property_images").select("id").eq("property_id", img.property_id).order("sort_order");
  if (error) return { ok: false, message: error.message };
  const ordered = [imageId, ...(all ?? []).map((r) => r.id).filter((id) => id !== imageId)];
  for (const [i, id] of ordered.entries()) {
    const { error: updErr } = await supabase.from("property_images").update({ sort_order: i }).eq("id", id);
    if (updErr) return { ok: false, message: updErr.message };
  }
  revalidateHost(await slugFor(img.property_id));
  return { ok: true };
}

async function slugFor(propertyId: string): Promise<string | undefined> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("properties").select("slug").eq("id", propertyId).maybeSingle();
  return data?.slug;
}

// ─── Content & branding ────────────────────────────────────────────────────

/** Object path inside the property-images bucket for a public URL we issued, or null. */
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/property-images/";
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

export async function saveContent(input: ContentInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first ? `${first.path.join(" › ")}: ${first.message}` : "Please check your content." };
  }
  const c = parsed.data;

  const { data: current, error: loadErr } = await supabase
    .from("properties")
    .select("id, slug, logo_url")
    .eq("id", c.propertyId)
    .eq("host_id", user.id)
    .maybeSingle();
  if (loadErr || !current) return { ok: false, message: "Property not found." };

  if (c.logoUrl && !storagePathFromUrl(c.logoUrl)?.startsWith(`${c.propertyId}/`)) {
    return { ok: false, message: "Upload the logo here so it's stored with your listing." };
  }

  const ms = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  const translations = {
    ms: {
      title: ms(c.title.ms),
      tagline: ms(c.tagline.ms),
      description: ms(c.description.ms),
      house_rules: c.houseRules.ms.filter(Boolean),
      cancellation_policy: ms(c.cancellationPolicy.ms),
      host_bio: ms(c.hostBio.ms),
    },
  };
  const publicSections = c.sections.filter((s) => s.audience === "public");
  const guestSections = c.sections.filter((s) => s.audience === "guests");

  const { error: updErr } = await supabase
    .from("properties")
    .update({
      title: c.title.en,
      tagline: c.tagline.en || null,
      description: c.description.en,
      house_rules: c.houseRules.en.filter(Boolean),
      cancellation_policy: c.cancellationPolicy.en,
      host_display_name: c.hostDisplayName || null,
      host_bio: c.hostBio.en || null,
      host_languages: c.hostLanguages.filter(Boolean),
      accent_color: c.accentColor.toLowerCase(),
      hero_layout: c.heroLayout,
      theme_preset: c.themePreset,
      logo_url: c.logoUrl,
      sections: JSON.parse(JSON.stringify(publicSections)),
      translations: JSON.parse(JSON.stringify(translations)),
    })
    .eq("id", c.propertyId)
    .eq("host_id", user.id);
  if (updErr) return { ok: false, message: updErr.message };

  const { error: guestErr } = await supabase
    .from("property_guest_content")
    .upsert({ property_id: c.propertyId, sections: JSON.parse(JSON.stringify(guestSections)) }, { onConflict: "property_id" });
  if (guestErr) return { ok: false, message: guestErr.message };

  // Remove the previous logo file when it was replaced or removed.
  const oldPath = storagePathFromUrl(current.logo_url);
  if (oldPath && current.logo_url !== c.logoUrl) await supabase.storage.from("property-images").remove([oldPath]);

  revalidateHost(current.slug);
  return { ok: true, message: "Content published." };
}
