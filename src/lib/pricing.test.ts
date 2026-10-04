import { describe, expect, it } from "vitest";
import { addDays, eachNight, isISODate, isoDayOfWeek, monthGrid, todayInTimeZone } from "./dates";
import { formatMoney, quoteStay, validateGuests, validateStay, type PricingRules } from "./pricing";

const rules: PricingRules = {
  currency: "MYR",
  weekday_rate: 38000,
  weekend_rate: 52000,
  weekend_days: [5, 6], // Fri & Sat nights
  cleaning_fee: 8000,
  security_deposit: 30000,
  min_nights: 2,
  max_nights: 21,
  payment_policy: "deposit",
  deposit_percent: 50,
};

describe("dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isISODate("2026-10-09")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-1-9")).toBe(false);
  });
  it("computes ISO weekday", () => {
    expect(isoDayOfWeek("2026-10-09")).toBe(5); // Friday
    expect(isoDayOfWeek("2026-10-11")).toBe(7); // Sunday
  });
  it("lists nights as [checkIn, checkOut)", () => {
    expect(eachNight("2026-10-08", "2026-10-11")).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
  });
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("builds a Monday-first month grid", () => {
    const grid = monthGrid("2026-10-01"); // 1 Oct 2026 is a Thursday
    expect(grid.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(grid.length % 7).toBe(0);
  });
  it("resolves today in a time zone", () => {
    // 2026-10-03T17:30Z is already 4 Oct in Kuala Lumpur (UTC+8)
    expect(todayInTimeZone("Asia/Kuala_Lumpur", new Date("2026-10-03T17:30:00Z"))).toBe("2026-10-04");
  });
});

describe("quoteStay", () => {
  it("prices weekday + weekend nights with a 50% deposit", () => {
    const q = quoteStay(rules, "2026-10-08", "2026-10-12"); // Thu, Fri, Sat, Sun
    expect(q.nights).toBe(4);
    expect(q.weekendNights).toBe(2);
    expect(q.subtotal).toBe(38000 * 2 + 52000 * 2);
    expect(q.stayCharges).toBe(188000);
    expect(q.total).toBe(218000);
    expect(q.dueNow).toBe(94000);
    expect(q.balanceDue).toBe(124000); // remaining stay charges + refundable deposit
    expect(q.dueNow + q.balanceDue).toBe(q.total);
  });

  it("charges everything up front under the full policy", () => {
    const q = quoteStay({ ...rules, payment_policy: "full" }, "2026-10-12", "2026-10-14");
    expect(q.dueNow).toBe(q.total);
    expect(q.balanceDue).toBe(0);
    expect(q.depositPercent).toBe(100);
  });

  it("rounds deposits to whole minor units", () => {
    const q = quoteStay({ ...rules, weekday_rate: 33333, cleaning_fee: 0, deposit_percent: 30 }, "2026-10-12", "2026-10-13");
    expect(Number.isInteger(q.dueNow)).toBe(true);
    expect(q.dueNow + q.balanceDue).toBe(q.total);
  });

  it("rejects zero-night stays", () => {
    expect(() => quoteStay(rules, "2026-10-12", "2026-10-12")).toThrow();
  });
});

describe("validateStay", () => {
  const today = "2026-10-03";
  it("enforces min nights", () => {
    expect(validateStay(rules, "2026-10-10", "2026-10-11", today, new Set())?.code).toBe("min_nights");
  });
  it("rejects past check-in", () => {
    expect(validateStay(rules, "2026-10-01", "2026-10-05", today, new Set())?.code).toBe("past_date");
  });
  it("detects clashes with unavailable nights", () => {
    const err = validateStay(rules, "2026-10-10", "2026-10-14", today, new Set(["2026-10-12"]));
    expect(err?.code).toBe("unavailable");
  });
  it("allows checking out on the morning another stay begins", () => {
    expect(validateStay(rules, "2026-10-10", "2026-10-12", today, new Set(["2026-10-12"]))).toBeNull();
  });
});

describe("validateGuests", () => {
  const cap = { max_guests: 4, max_infants: 1 };
  it("requires an adult", () => expect(validateGuests(cap, { adults: 0, children: 2, infants: 0 })).not.toBeNull());
  it("caps adults + children", () => expect(validateGuests(cap, { adults: 3, children: 2, infants: 0 })).not.toBeNull());
  it("does not count infants toward capacity", () => expect(validateGuests(cap, { adults: 2, children: 2, infants: 1 })).toBeNull());
  it("caps infants", () => expect(validateGuests(cap, { adults: 1, children: 0, infants: 2 })).not.toBeNull());
});

describe("formatMoney", () => {
  it("formats MYR minor units", () => {
    // Intl inserts a non-breaking space between symbol and amount
    expect(formatMoney(38000, "MYR").replace(/\s/g, " ")).toBe("RM 380");
    expect(formatMoney(38050, "MYR").replace(/\s/g, " ")).toBe("RM 380.50");
  });
});
