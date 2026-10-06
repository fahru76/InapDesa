import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { walletOptions, xSignatureSource, type BillplzGateway, type WalletOption } from "./billplz-core";
import { log } from "@/lib/log";

/**
 * Billplz API client (Malaysian FPX, DuitNow QR and e-wallets).
 * Inactive until BILLPLZ_API_KEY, BILLPLZ_COLLECTION_ID and BILLPLZ_X_SIGNATURE_KEY are set.
 * Docs: https://www.billplz.com/api
 */

interface BillplzConfig {
  apiKey: string;
  collectionId: string;
  xSignatureKey: string;
  baseUrl: string;
  sandbox: boolean;
}

export function billplzConfig(): BillplzConfig | null {
  const apiKey = process.env.BILLPLZ_API_KEY?.trim();
  const collectionId = process.env.BILLPLZ_COLLECTION_ID?.trim();
  const xSignatureKey = process.env.BILLPLZ_X_SIGNATURE_KEY?.trim();
  if (!apiKey || !collectionId || !xSignatureKey) return null;
  // Default to sandbox unless explicitly switched to production.
  const sandbox = (process.env.BILLPLZ_SANDBOX ?? "true").toLowerCase() !== "false";
  return {
    apiKey,
    collectionId,
    xSignatureKey,
    sandbox,
    baseUrl: sandbox ? "https://www.billplz-sandbox.com/api" : "https://www.billplz.com/api",
  };
}

export const billplzConfigured = () => billplzConfig() !== null;

export class BillplzError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(
  cfg: BillplzConfig,
  path: string,
  init: { method?: string; form?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:`).toString("base64")}`,
      Accept: "application/json",
      ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init.form ? new URLSearchParams(init.form).toString() : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `Billplz ${res.status}`;
    try {
      const body = JSON.parse(text) as { error?: { message?: string | string[] } };
      const m = body.error?.message;
      if (m) message = Array.isArray(m) ? m.join(", ") : m;
    } catch {
      /* non-JSON error body */
    }
    throw new BillplzError(message, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface BillplzBill {
  id: string;
  collection_id: string;
  paid: boolean;
  state: "due" | "paid" | "deleted";
  amount: number;
  paid_amount: number;
  url: string;
  reference_1_label: string | null;
  reference_1: string | null;
  reference_2: string | null;
  paid_at: string | null;
}

export interface CreateBillInput {
  name: string;
  email: string;
  mobile: string;
  /** Minor units (sen). */
  amount: number;
  description: string;
  callbackUrl: string;
  redirectUrl: string;
  /** Booking reference, stored as reference_2. */
  reference: string;
  /** Optional gateway code to skip Billplz's selection page (Direct Payment Gateway). */
  gatewayCode?: string | null;
}

export async function createBill(input: CreateBillInput): Promise<BillplzBill> {
  const cfg = billplzConfig();
  if (!cfg) throw new BillplzError("Billplz is not configured", 503);
  const form: Record<string, string> = {
    collection_id: cfg.collectionId,
    email: input.email,
    mobile: input.mobile.replace(/[^\d+]/g, ""),
    name: input.name.slice(0, 255),
    amount: String(input.amount),
    description: input.description.slice(0, 200),
    callback_url: input.callbackUrl,
    redirect_url: input.redirectUrl,
    reference_2_label: "Booking",
    reference_2: input.reference,
  };
  if (input.gatewayCode) {
    form.reference_1_label = "Bank Code";
    form.reference_1 = input.gatewayCode;
  }
  return request<BillplzBill>(cfg, "/v3/bills", { method: "POST", form });
}

export async function getBill(id: string): Promise<BillplzBill> {
  const cfg = billplzConfig();
  if (!cfg) throw new BillplzError("Billplz is not configured", 503);
  return request<BillplzBill>(cfg, `/v3/bills/${encodeURIComponent(id)}`);
}

/** Only unpaid ("due") bills can be deleted; Billplz returns 422 for paid ones. */
export async function deleteBill(id: string): Promise<void> {
  const cfg = billplzConfig();
  if (!cfg) return;
  await request<unknown>(cfg, `/v3/bills/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** URL that sends the payer straight to the chosen gateway when one was preselected. */
export function billPaymentUrl(bill: BillplzBill, preselected: boolean): string {
  return preselected ? `${bill.url}${bill.url.includes("?") ? "&" : "?"}auto_submit=true` : bill.url;
}

let gatewayCache: { at: number; options: WalletOption[] } | null = null;
const GATEWAY_LIST_TIMEOUT_MS = 4_000;

/** Active e-wallet / DuitNow QR gateways on this Billplz account (cached 10 minutes). */
export async function getWalletOptions(): Promise<WalletOption[]> {
  const cfg = billplzConfig();
  if (!cfg) return [];
  if (gatewayCache && Date.now() - gatewayCache.at < 10 * 60_000) return gatewayCache.options;
  try {
    // Runs while the checkout page renders, so fail fast: on timeout we fall back to the cached list
    // (or none, and guests still pick FPX/wallets on Billplz's own page).
    const body = await request<{ payment_gateways?: BillplzGateway[] } | BillplzGateway[]>(cfg, "/v4/payment_gateways", {
      timeoutMs: GATEWAY_LIST_TIMEOUT_MS,
    });
    const list = Array.isArray(body) ? body : (body.payment_gateways ?? []);
    const options = walletOptions(list);
    gatewayCache = { at: Date.now(), options };
    return options;
  } catch (err) {
    log.error("billplz.gateways-unavailable", { err });
    return gatewayCache?.options ?? [];
  }
}

/** Verify an X Signature (callback body or flattened redirect params). */
export function verifyXSignature(params: Record<string, string>, signature: string | null | undefined): boolean {
  const cfg = billplzConfig();
  if (!cfg || !signature) return false;
  const expected = createHmac("sha256", cfg.xSignatureKey).update(xSignatureSource(params)).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
