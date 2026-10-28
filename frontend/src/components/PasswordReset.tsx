"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

function Card({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="space-y-5 rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-200">
        <div>
          <h1 className="font-serif text-3xl text-navy-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{sub}</p>
        </div>
        {children}
      </div>
    </main>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Card title="Check your inbox" sub={`If an account exists for ${email.trim()}, we've emailed a link to reset your password.`}>
        <p className="text-sm text-slate-600">The link works once and expires in 3 days. Don&apos;t see it? Check spam, or log in with an email code instead.</p>
        <Link href="/login" className="btn-secondary w-full">
          Back to log in
        </Link>
      </Card>
    );
  }
  return (
    <Card title="Forgot your password?" sub="Enter your email and we'll send you a reset link.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">Email</span>
          <input required type="email" autoComplete="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="btn-primary w-full py-3">
          {busy ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-ivy-700 underline">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}

export function ResetPassword() {
  const params = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!uid || !token) {
    return (
      <Card title="Invalid link" sub="This reset link is incomplete.">
        <Link href="/forgot-password" className="btn-primary w-full">
          Request a new link
        </Link>
      </Card>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setUser(await api.resetPassword(uid, token, password));
      router.replace("/dashboard");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Card title="Set a new password" sub="Choose a password you haven't used here before.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="label">New password</span>
          <input required type="password" minLength={8} autoComplete="new-password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">Confirm password</span>
          <input required type="password" autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {error && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}{" "}
            {/invalid|used/i.test(error) && (
              <Link href="/forgot-password" className="font-semibold underline">
                Get a new link
              </Link>
            )}
          </p>
        )}
        <button disabled={busy} className="btn-primary w-full py-3">
          {busy ? "Saving…" : "Save & log in"}
        </button>
      </form>
    </Card>
  );
}
