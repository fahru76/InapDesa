/**
 * Pure Billplz helpers (no network, no secrets) — unit-tested in billplz-core.test.ts.
 * Spec: https://www.billplz.com/api (X Signature, Payment Gateways v4)
 */

/**
 * Build the X Signature source string.
 * Per Billplz's documented examples, each pair is concatenated as `key + value`, the resulting
 * strings are sorted ascending (case-insensitive) and joined with `|`.
 * Example (redirect): "billplzidzq0tm2wc|billplzpaid_at2018-09-27 15:15:09 +0800|billplzpaidtrue"
 */
export function xSignatureSource(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([k]) => k !== "x_signature" && k !== "billplzx_signature")
    .map(([k, v]) => `${k}${v}`)
    .sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    })
    .join("|");
}

/** Flatten redirect query params `billplz[id]=…` into `billplzid` keys used in the source string. */
export function flattenRedirectParams(search: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of search.entries()) {
    const m = /^billplz\[(\w+)\]$/.exec(k);
    if (m) out[`billplz${m[1]}`] = v;
  }
  return out;
}

export type WalletBrand = "tng" | "boost" | "shopeepay" | "grabpay" | "duitnow";

export interface BillplzGateway {
  code: string;
  active: boolean;
  category?: string;
}

export interface WalletOption {
  brand: WalletBrand;
  code: string;
  label: string;
}

export const WALLET_LABELS: Record<WalletBrand, string> = {
  tng: "Touch 'n Go eWallet",
  boost: "Boost",
  shopeepay: "ShopeePay",
  grabpay: "GrabPay",
  duitnow: "DuitNow QR",
};

/** Display order on the checkout page. */
const ORDER: WalletBrand[] = ["tng", "duitnow", "grabpay", "shopeepay", "boost"];

/** Match a Billplz gateway code to a wallet brand (codes vary by acquirer, e.g. BP-TNG01 / BP-2C2PTNGTnG). */
export function walletBrandForCode(code: string): WalletBrand | null {
  if (/tng/i.test(code)) return "tng";
  if (/boost|bst/i.test(code)) return "boost";
  if (/shopee|shpe/i.test(code)) return "shopeepay";
  if (/grab|grb/i.test(code)) return "grabpay";
  if (/duitnow/i.test(code)) return "duitnow";
  return null;
}

/** One active gateway per wallet brand, in display order. */
export function walletOptions(gateways: BillplzGateway[]): WalletOption[] {
  const byBrand = new Map<WalletBrand, string>();
  for (const g of gateways) {
    if (!g.active) continue;
    const brand = walletBrandForCode(g.code);
    if (brand && !byBrand.has(brand)) byBrand.set(brand, g.code);
  }
  return ORDER.filter((b) => byBrand.has(b)).map((b) => ({ brand: b, code: byBrand.get(b) as string, label: WALLET_LABELS[b] }));
}

/** Human label for a stored payment method code (transactions.payment_method_type). */
export function billplzMethodLabel(code: string | null | undefined): string {
  if (!code) return "Billplz";
  const brand = walletBrandForCode(code);
  return brand ? WALLET_LABELS[brand] : code === "fpx" ? "FPX" : "Billplz";
}
