"use client";

import { Mail, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputStyles } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-2xl bg-brand-50 p-5 text-center dark:bg-brand-500/10">
        <MailCheck className="mx-auto size-7 text-brand-600" aria-hidden />
        <p className="mt-2 font-semibold">Check your inbox</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          We sent a sign-in link to <span className="font-medium text-ink dark:text-white">{email}</span>.
        </p>
        <button type="button" onClick={() => setSent(false)} className="mt-3 text-sm font-semibold underline underline-offset-4">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={error}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoFocus
          className={inputStyles}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={!!error}
          placeholder="you@yourhomestay.com"
        />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        <Mail className="size-4" aria-hidden /> Email me a sign-in link
      </Button>
    </form>
  );
}
