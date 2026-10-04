import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { billplzMethodLabel, flattenRedirectParams, walletOptions, xSignatureSource } from "./billplz-core";

describe("Billplz X Signature source string", () => {
  it("matches Billplz's documented redirect example", () => {
    const search = new URLSearchParams(
      "billplz[id]=zq0tm2wc&billplz[paid]=true&billplz[paid_at]=2018-09-27%2015%3A15%3A09%20%2B0800&billplz[x_signature]=abc",
    );
    expect(xSignatureSource(flattenRedirectParams(search))).toBe("billplzidzq0tm2wc|billplzpaid_at2018-09-27 15:15:09 +0800|billplzpaidtrue");
  });

  it("matches Billplz's documented callback ordering and excludes x_signature", () => {
    const src = xSignatureSource({
      name: "Michael",
      email: "api@billplz.com",
      amount: "200",
      collection_id: "inbmmepb",
      description: "testing",
      callback_url: "https://example.com/webhook",
      x_signature: "ignored",
    });
    expect(src).toBe("amount200|callback_urlhttps://example.com/webhook|collection_idinbmmepb|descriptiontesting|emailapi@billplz.com|nameMichael");
  });

  it("produces a verifiable HMAC-SHA256 digest", () => {
    const params = { id: "W_79pJDk", paid: "true", amount: "42000" };
    const sig = createHmac("sha256", "secret").update(xSignatureSource(params)).digest("hex");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(createHmac("sha256", "secret").update(xSignatureSource({ ...params, x_signature: sig })).digest("hex")).toBe(sig);
  });
});

describe("walletOptions", () => {
  it("picks one active gateway per wallet in display order", () => {
    const opts = walletOptions([
      { code: "BP-2C2PBSTBoost", active: true },
      { code: "BP-TNG01", active: false },
      { code: "BP-2C2PTNGTnG", active: true },
      { code: "BP-RHBQRDuitnow QR", active: true },
      { code: "BP-FKR01", active: true, category: "fpx" },
      { code: "BP-RZRGRBGrab", active: true },
    ]);
    expect(opts.map((o) => o.brand)).toEqual(["tng", "duitnow", "grabpay", "boost"]);
    expect(opts[0]?.code).toBe("BP-2C2PTNGTnG");
  });

  it("labels stored method codes", () => {
    expect(billplzMethodLabel("BP-2C2PSHPEShopee Pay")).toBe("ShopeePay");
    expect(billplzMethodLabel(null)).toBe("Billplz");
  });
});
