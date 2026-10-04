import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Host sign in", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function safeNext(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/host";
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  return (
    <div className="relative grid min-h-[calc(100dvh-4rem)] place-items-center overflow-hidden px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_0%,rgb(16_185_129/0.12),transparent)]" />
      <div className="card relative w-full max-w-sm p-8 shadow-float">
        <h1 className="text-2xl font-semibold tracking-tight">Host sign in</h1>
        <p className="mt-1.5 text-sm text-zinc-500">We&apos;ll email you a secure one-time link. No password needed.</p>
        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
            {error === "not_allowed" ? "This email isn't registered as a host." : "That sign-in link is invalid or has expired. Request a new one."}
          </p>
        )}
        <LoginForm next={safeNext(sp.next)} />
      </div>
    </div>
  );
}
