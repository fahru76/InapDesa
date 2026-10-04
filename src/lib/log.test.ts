import { afterEach, describe, expect, it, vi } from "vitest";
import { log, serialize } from "./log";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function capture(method: "log" | "warn" | "error") {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  return () => {
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    expect(typeof line).toBe("string");
    expect(line).not.toContain("\n");
    return JSON.parse(line) as Record<string, unknown>;
  };
}

describe("log", () => {
  it("writes one JSON line per event at the right console level", () => {
    const read = capture("error");
    log.error("stripe-webhook.failed", { eventId: "evt_1", type: "payment_intent.succeeded" });
    const entry = read();
    expect(entry).toMatchObject({ level: "error", event: "stripe-webhook.failed", eventId: "evt_1", type: "payment_intent.succeeded" });
    expect(typeof entry.ts).toBe("string");
  });

  it("routes info to console.log and warn to console.warn", () => {
    const info = capture("log");
    log.info("cron.done", { ms: 12 });
    expect(info()).toMatchObject({ level: "info", ms: 12 });
    const warn = capture("warn");
    log.warn("billplz-callback.bad-signature", { billId: "abc" });
    expect(warn()).toMatchObject({ level: "warn", billId: "abc" });
  });

  it("never logs personal data or secrets", () => {
    const read = capture("error");
    log.error("booking.failed", {
      bookingId: "b1",
      guest_email: "ali@example.com",
      guestPhone: "+60123456789",
      guest_name: "Ali",
      nested: { authorization: "Bearer sk_live_x", token: "t", ok: true },
    });
    const text = JSON.stringify(read());
    for (const secret of ["ali@example.com", "+60123456789", "Ali", "sk_live_x"]) expect(text).not.toContain(secret);
    expect(text).toContain("b1");
    expect(text).toContain('"ok":true');
  });

  it("masks email addresses and card-like numbers inside free text", () => {
    expect(serialize("refund to ali@example.com failed")).toBe("refund to [email] failed");
    expect(serialize("card 4242 4242 4242 4242 declined")).toBe("card [number] declined");
  });

  it("serialises errors to name/message, with the stack only outside production", () => {
    const err = new Error("boom");
    vi.stubEnv("NODE_ENV", "production");
    expect(serialize(err)).toEqual({ name: "Error", message: "boom" });
    vi.stubEnv("NODE_ENV", "development");
    expect(serialize(err)).toMatchObject({ name: "Error", message: "boom", stack: expect.any(String) });
  });

  it("caps long strings, deep objects and long arrays", () => {
    expect((serialize("x".repeat(2000)) as string).length).toBeLessThanOrEqual(501);
    expect(serialize({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({ a: { b: { c: "[object]" } } });
    expect((serialize(Array.from({ length: 50 }, (_, i) => i)) as unknown[]).length).toBe(21);
  });

  it("does not throw on circular or odd values", () => {
    const a: Record<string, unknown> = { id: 1 };
    a.self = a;
    const read = capture("warn");
    expect(() => log.warn("odd", { a, big: BigInt(9), fn: () => 1, nothing: undefined })).not.toThrow();
    expect(read()).toMatchObject({ big: "9" });
  });
});
