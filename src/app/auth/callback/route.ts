import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

/** Completes magic-link sign in (PKCE `code` or `token_hash` email template flows). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/host";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/host";

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  if (!ok) return NextResponse.redirect(new URL("/login?error=link", url.origin));

  const allowlist = serverEnv.hostEmailAllowlist;
  if (allowlist.length > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || !allowlist.includes(user.email.toLowerCase())) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not_allowed", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
