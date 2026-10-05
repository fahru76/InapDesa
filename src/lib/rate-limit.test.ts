import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to the limit within a window, then blocks with a retry time", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;
    expect(limiter.check("a", t0).allowed).toBe(true);
    expect(limiter.check("a", t0 + 1).allowed).toBe(true);
    expect(limiter.check("a", t0 + 2).allowed).toBe(true);
    expect(limiter.check("a", t0 + 10_000)).toEqual({ allowed: false, retryAfterSeconds: 50 });
  });

  it("counts keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
  });

  it("resets after the window passes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("a", 59_999).allowed).toBe(false);
    expect(limiter.check("a", 60_000).allowed).toBe(true);
  });

  it("never grows past maxKeys (expired entries are evicted first)", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 2 });
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 5_000); // a and b expired → evicted
    expect(limiter.size()).toBe(1);
    limiter.check("d", 5_000);
    limiter.check("e", 5_000); // full of live keys → oldest dropped
    expect(limiter.size()).toBe(2);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
