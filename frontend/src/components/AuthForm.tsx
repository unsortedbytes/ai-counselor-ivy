"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { GoogleButton } from "./GoogleButton";

/** Only follow same-site relative paths after login (no open redirects). */
export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

type Method = "password" | "code";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setUser } = useAuth();
  const [method, setMethod] = useState<Method>("password");
  const [form, setForm] = useState({ name: "", email: "", password: "", code: "" });
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const next = safeNext(params.get("next"));
  const signup = mode === "signup";

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const signedIn = useCallback(
    (user: User) => {
      setUser(user);
      router.replace(next);
    },
    [next, router, setUser],
  );

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await api.otpRequest(form.email.trim());
      setCodeSent(true);
      setCooldown(60);
      setNotice(`We sent a 6-digit code to ${form.email.trim()}. It expires in 10 minutes.`);
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === "code") {
      if (!codeSent) return sendCode();
      return run(async () => signedIn(await api.otpVerify(form.email.trim(), form.code.trim(), form.name.trim() || undefined)));
    }
    return run(async () =>
      signedIn(
        signup
          ? await api.register(form.name.trim(), form.email.trim(), form.password)
          : await api.login(form.email.trim(), form.password),
      ),
    );
  };

  const switchMethod = (m: Method) => {
    setMethod(m);
    setError("");
    setNotice("");
    setCodeSent(false);
  };

  const other = `${signup ? "/login" : "/signup"}${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`;
  const submitLabel = busy
    ? "Please wait…"
    : method === "code"
      ? codeSent
        ? "Verify & continue"
        : "Email me a code"
      : signup
        ? "Create account"
        : "Log in";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="gradient-card rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-semibold text-navy-900">{signup ? "Create your account" : "Welcome back"}</h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">
          {signup ? "Save your essay brainstorms and structure reports." : "Log in to continue brainstorming your essays."}
        </p>

        <GoogleButton onSignedIn={signedIn} label={signup ? "signup_with" : "signin_with"} />

        <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-medium" role="tablist">
          {(["password", "code"] as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={method === m}
              onClick={() => switchMethod(m)}
              className={`rounded-lg py-2 transition ${method === m ? "bg-white text-navy-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {m === "password" ? "Password" : "Email code"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {signup && (
            <label className="block">
              <span className="label">First name</span>
              <input required autoComplete="given-name" className="field" value={form.name} onChange={set("name")} placeholder="Aanya" />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input
              required
              type="email"
              autoComplete="email"
              className="field"
              value={form.email}
              onChange={(e) => {
                set("email")(e);
                setCodeSent(false);
              }}
              placeholder="you@example.com"
            />
          </label>

          {method === "password" && (
            <label className="block">
              <span className="flex items-baseline justify-between">
                <span className="label">Password</span>
                {!signup && (
                  <Link href="/forgot-password" className="text-xs font-medium text-ivy-700 underline">
                    Forgot password?
                  </Link>
                )}
              </span>
              <input
                required
                type="password"
                minLength={signup ? 8 : undefined}
                autoComplete={signup ? "new-password" : "current-password"}
                className="field"
                value={form.password}
                onChange={set("password")}
              />
              {signup && <span className="mt-1 block text-xs text-slate-500">At least 8 characters, not too common.</span>}
            </label>
          )}

          {method === "code" && codeSent && (
            <label className="block">
              <span className="flex items-baseline justify-between">
                <span className="label">6-digit code</span>
                <button
                  type="button"
                  disabled={cooldown > 0 || busy}
                  onClick={sendCode}
                  className="text-xs font-medium text-ivy-700 underline disabled:text-slate-400 disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </span>
              <input
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                className="field text-center font-mono text-2xl tracking-[0.5em]"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\D/g, "") })}
                placeholder="••••••"
              />
            </label>
          )}
          {method === "code" && !codeSent && (
            <p className="text-xs text-slate-500">No password needed — we&apos;ll email you a one-time code{signup ? "" : " (new emails get an account automatically)"}.</p>
          )}

          {notice && <p className="rounded-lg bg-ivy-50 p-3 text-sm text-ivy-700">{notice}</p>}
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button disabled={busy} className="btn-primary w-full py-3">
            {submitLabel}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          {signup ? "Already have an account? " : "New here? "}
          <Link href={other} className="font-semibold text-ivy-700 underline">
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
