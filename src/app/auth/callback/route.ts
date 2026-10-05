import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

type OtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "phone_change";

/** Completes magic-link sign in (PKCE `code` or `token_hash` email template flows). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as OtpType | null;
  const rawNext = url.searchParams.get("next") ?? "/host";
  const next = rawNext && !rawNext.startsWith("/") ? rawNext : rawNext.startsWith("//") ? rawNext : "/host";

  const supabase = await createClient();
  let success = false;

  // Code exchange flow
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    success = !error;
  } else if (tokenHash && type) {
    // OTP verification flow
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    success = !error;
  }

  if (!success) {
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }

  const allowlist = serverEnv.hostEmailAllowlist;
  if (allowlist.length > 0) {
    const { data, user } = await supabase.auth.getUser();
    if (!user?.email || !allowlist.includes(user.email.toLowerCase())) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not_allowed", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
