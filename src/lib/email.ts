import "server-only";

import { serverEnv } from "./env";
import { log } from "@/lib/log";

export type SendResult = { sent: true; id: string } | { sent: false; reason: "not_configured" | "failed"; detail?: string };

export function emailConfigured(): boolean {
  return Boolean(serverEnv.resendApiKey && serverEnv.emailFrom);
}

/** Send one transactional email through Resend's HTTPS API. Never throws. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string; replyTo?: string | null }): Promise<SendResult> {
  const key = serverEnv.resendApiKey;
  const from = serverEnv.emailFrom;
  if (!key || !from) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      log.error("email.rejected", { status: res.status, detail });
      return { sent: false, reason: "failed", detail: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as { id?: string };
    return { sent: true, id: body.id ?? "" };
  } catch (err) {
    log.error("email.send-failed", { err });
    return { sent: false, reason: "failed" };
  }
}

export function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
