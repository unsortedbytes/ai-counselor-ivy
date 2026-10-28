"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Session } from "@/lib/types";

const STATUS: Record<string, { label: string; cls: string; action: string; href: (id: string) => string }> = {
  created: { label: "Not started", cls: "bg-slate-100 text-slate-600", action: "Start brainstorming", href: (id) => `/session/${id}` },
  capturing: { label: "Information capture", cls: "bg-sky-50 text-sky-700", action: "Continue", href: (id) => `/session/${id}` },
  drafting: { label: "Drafting structure", cls: "bg-amber-50 text-amber-700", action: "View progress", href: (id) => `/session/${id}` },
  structuring: { label: "Building structure", cls: "bg-violet-50 text-violet-700", action: "Continue", href: (id) => `/session/${id}` },
  completed: { label: "Report ready", cls: "bg-emerald-50 text-emerald-700", action: "View report", href: (id) => `/session/${id}/report` },
  failed: { label: "Needs retry", cls: "bg-red-50 text-red-700", action: "Retry", href: (id) => `/session/${id}` },
};

export function Dashboard() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .sessions()
      .then(setSessions)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-navy-900">{user ? `Hi ${user.name}` : "My essays"}</h1>
          <p className="text-sm text-slate-500">Your essay brainstorms and structure reports.</p>
        </div>
        <Link href="/" className="btn-primary">
          New Essay Brainstorming →
        </Link>
      </div>

      {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
      {sessions === null && !error && <p className="mt-10 text-center text-slate-500">Loading…</p>}
      {sessions?.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          Nothing here yet. Start a brainstorm — it takes about 10–15 minutes.
        </div>
      )}

      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {sessions?.map((s) => {
          const st = STATUS[s.status] ?? STATUS.created;
          return (
            <li key={s.id} className="gradient-card rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-navy-900">{s.essay_title}</p>
                  <p className="truncate text-sm text-slate-500">
                    {s.college} · {s.word_limit} words
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {new Date(s.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                <Link href={st.href(s.id)} className={`${s.status === "completed" ? "btn-secondary" : "btn-primary"} px-3 py-1.5 text-sm`}>
                  {st.action}
                </Link>
                {s.status === "completed" && (
                  <a href={api.reportPdfUrl(s.id)} className="btn-secondary px-3 py-1.5 text-sm" download>
                    PDF
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
