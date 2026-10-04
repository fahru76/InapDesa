import { describe, expect, it } from "vitest";
import { refundAt, refundSchedule, splitDueNow, splitPaid, zonedTimeToUtc } from "./cancellation";
import { buildIcs, nightsToRanges, parseIcs, rangesToNights } from "./ical";
import { checkFeedUrl, isPublicAddress } from "./net-guard";
import { quoteStay, tourismTaxFor, type PricingRules } from "./pricing";

const rules: PricingRules = {
  currency: "MYR",
  weekday_rate: 38000,
  weekend_rate: 52000,
  weekend_days: [5, 6],
  cleaning_fee: 8000,
  security_deposit: 30000,
  min_nights: 2,
  max_nights: 21,
  payment_policy: "deposit",
  deposit_percent: 50,
  tourism_tax_enabled: true,
  tourism_tax_rate: 1000,
  tourism_tax_rooms: 1,
};

describe("tourism tax", () => {
  it("applies only to foreign guests when enabled", () => {
    expect(tourismTaxFor(rules, 3, true)).toBe(3000);
    expect(tourismTaxFor(rules, 3, false)).toBe(0);
    expect(tourismTaxFor({ ...rules, tourism_tax_enabled: false }, 3, true)).toBe(0);
    expect(tourismTaxFor({ ...rules, tourism_tax_rooms: 3 }, 2, true)).toBe(6000);
  });
  it("goes into the balance under the deposit policy and into today's payment under full", () => {
    const dep = quoteStay(rules, "2026-10-12", "2026-10-15", { foreignGuest: true }); // Mon–Thu, 3 weekday nights
    expect(dep.tourismTax).toBe(3000);
    expect(dep.dueNow).toBe(Math.round((dep.stayCharges * 50) / 100)); // deposit unchanged by tax
    expect(dep.total).toBe(dep.stayCharges + 30000 + 3000);
    expect(dep.dueNow + dep.balanceDue).toBe(dep.total);
    const full = quoteStay({ ...rules, payment_policy: "full" }, "2026-10-12", "2026-10-15", { foreignGuest: true });
    expect(full.dueNow).toBe(full.total);
    expect(full.balanceDue).toBe(0);
  });
});

describe("cancellation", () => {
  const paid = splitPaid({ amount_paid: 61000, total_amount: 152000, security_deposit: 30000, payment_policy: "deposit" });
  it("treats a deposit-policy advance as all stay charges", () => {
    expect(paid).toEqual({ stayPaid: 61000, extrasPaid: 0 });
  });
  it("returns extras in full under the full policy", () => {
    expect(splitPaid({ amount_paid: 152000, total_amount: 152000, security_deposit: 30000, tourism_tax: 3000, payment_policy: "full" })).toEqual({
      stayPaid: 119000,
      extrasPaid: 33000,
    });
    expect(splitDueNow({ dueNow: 152000, securityDeposit: 30000, policy: "full" })).toEqual({ stayPaid: 122000, extrasPaid: 30000 });
  });
  it("builds a dated schedule", () => {
    const s = refundSchedule("firm", "2026-12-20", "15:00:00", paid);
    expect(s).toEqual([
      { until: { date: "2026-11-20", time: "15:00" }, percent: 100, refund: 61000 },
      { until: { date: "2026-12-13", time: "15:00" }, percent: 50, refund: 30500 },
      { until: null, percent: 0, refund: 0 },
    ]);
    expect(refundSchedule("custom", "2026-12-20", "15:00", paid)).toEqual([]);
    expect(refundSchedule("non_refundable", "2026-12-20", "15:00", paid)).toEqual([{ until: null, percent: 0, refund: 0 }]);
  });
  it("converts property wall-clock time to UTC", () => {
    expect(zonedTimeToUtc("2026-10-13", "15:00", "Asia/Kuala_Lumpur").toISOString()).toBe("2026-10-13T07:00:00.000Z");
  });
  it("picks the refund in force at a given moment", () => {
    const tz = "Asia/Kuala_Lumpur";
    // moderate: full refund until 13 Oct 15:00 MYT (07:00Z)
    expect(refundAt("moderate", "2026-10-20", "15:00", tz, paid, new Date("2026-10-13T06:59:00Z"))).toEqual({ percent: 100, refund: 61000 });
    expect(refundAt("moderate", "2026-10-20", "15:00", tz, paid, new Date("2026-10-13T07:01:00Z"))).toEqual({ percent: 0, refund: 0 });
    expect(refundAt("custom", "2026-10-20", "15:00", tz, paid)).toBeNull();
  });
});

describe("iCal", () => {
  const airbnb = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN",
    "BEGIN:VEVENT",
    "DTEND;VALUE=DATE:20261014",
    "DTSTART;VALUE=DATE:20261011",
    "UID:1418fb94e984-0b6f0c8d@airbnb.com",
    "SUMMARY:Reserved",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART:20261020T060000Z",
    "DTEND:20261022T040000Z",
    "SUMMARY:Booking.com (Not available)",
    "UID:abc",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261101",
    "DTEND;VALUE=DATE:20261103",
    "STATUS:CANCELLED",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "DTSTART;VALUE=DATE:20261105",
    "SUMMARY:single day, no end",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("parses all-day and UTC events, skips cancelled ones", () => {
    const ranges = parseIcs(airbnb, "Asia/Kuala_Lumpur");
    expect(ranges.map((r) => [r.start, r.end])).toEqual([
      ["2026-10-11", "2026-10-14"],
      ["2026-10-20", "2026-10-22"],
      ["2026-11-05", "2026-11-06"],
    ]);
  });
  it("unfolds long lines", () => {
    const folded = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:2026\r\n 1010\r\nEND:VEVENT\r\nEND:VCALENDAR";
    expect(parseIcs(folded, "UTC")[0]?.start).toBe("2026-10-10");
  });
  it("rejects non-calendar content", () => {
    expect(() => parseIcs("<html>login</html>", "UTC")).toThrow();
  });
  it("expands to nights within a window and regroups", () => {
    const nights = rangesToNights(parseIcs(airbnb, "Asia/Kuala_Lumpur"), "2026-10-12", "2026-10-21");
    expect([...nights].sort()).toEqual(["2026-10-12", "2026-10-13", "2026-10-20"]);
    expect(nightsToRanges(["2026-10-13", "2026-10-12", "2026-10-20"])).toEqual([
      { start: "2026-10-12", end: "2026-10-14" },
      { start: "2026-10-20", end: "2026-10-21" },
    ]);
  });
  it("round-trips an export", () => {
    const ics = buildIcs("Teratak Senja, InapDesa", [{ uid: "b1@inapdesa", start: "2026-10-11", end: "2026-10-14", summary: "Reserved (InapDesa)" }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:20261011");
    expect(ics).toContain("X-WR-CALNAME:Teratak Senja\\, InapDesa");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(parseIcs(ics, "UTC")).toEqual([{ start: "2026-10-11", end: "2026-10-14", uid: "b1@inapdesa" }]);
  });
});

describe("network guard", () => {
  it("blocks private and special addresses", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "224.0.0.1"]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
    for (const a of ["8.8.8.8", "54.230.1.1", "2606:4700::6810:84e5"]) expect(isPublicAddress(a), a).toBe(true);
  });
  it("validates feed URLs", () => {
    expect(checkFeedUrl("https://www.airbnb.com/calendar/ical/123.ics?s=abc").ok).toBe(true);
    expect(checkFeedUrl("http://www.airbnb.com/x.ics").ok).toBe(false);
    expect(checkFeedUrl("https://127.0.0.1/x.ics").ok).toBe(false);
    expect(checkFeedUrl("https://user:pw@example.com/x.ics").ok).toBe(false);
    expect(checkFeedUrl("https://example.com:8443/x.ics").ok).toBe(false);
    expect(checkFeedUrl("https://localhost/x.ics").ok).toBe(false);
    expect(checkFeedUrl("not a url").ok).toBe(false);
  });
});
