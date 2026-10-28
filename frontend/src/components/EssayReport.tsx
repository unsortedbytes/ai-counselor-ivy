"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useHeader } from "@/lib/header";
import { headerFor } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { IvyOrb } from "./IvyOrb";

// One colour per section in the word-budget bar.
const BAR = ["#2f62f0", "#19c6c3", "#8b5cf6", "#f59e0b", "#ec4899", "#10b981", "#64748b"];

/** The final essay-structure report, with a PDF download. */
export function EssayReport({ id }: { id: string }) {
  const { session, error } = useSession(id);
  useHeader(headerFor(session, "Essay Structure Report"));

  const data = session?.structure;
  if (!session || !data) {
    return (
      <p className="p-10 text-center text-slate-500">
        {error || (session ? "Your essay structure isn't ready yet." : "Loading your report…")}
        {session && !data && (
          <Link href={`/session/${id}`} className="ml-2 font-medium text-ivy-600 hover:underline">
            Continue brainstorming →
          </Link>
        )}
      </p>
    );
  }

  const college = session.college || "your college";
  const total = data.sections.reduce((t, s) => t + s.word_count, 0);
  const answers = new Map((session.answers ?? []).map((a) => [a.number, a.text]));
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <section className="gradient-card rounded-2xl p-6 shadow-sm">
        <div className="flex flex-wrap items-start gap-5">
          <IvyOrb size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-ivy-600">Your essay structure</p>
            <h1 className="mt-1 text-2xl font-semibold text-navy-900">{data.working_title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {session.student_name} · {college} · {session.essay_title} · {session.word_limit} words
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <a href={api.reportPdfUrl(id)} className="btn-primary text-sm" download>
              <DownloadIcon /> Download PDF
            </a>
            <Link href={`/session/${id}/review`} className="btn-secondary text-sm">
              Edit structure
            </Link>
          </div>
        </div>
        <blockquote className="mt-5 rounded-xl bg-lilac-50 px-4 py-3 text-sm leading-relaxed text-slate-700 ring-1 ring-lilac-100">
          {session.prompt_text.replaceAll("(this college)", college)}
        </blockquote>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Fact label="Central theme">{data.central_theme}</Fact>
        <Fact label="Thesis">{data.thesis}</Fact>
        <Fact label="Approach">
          <span className="font-medium">{data.narrative_approach}.</span> {data.approach_rationale}
        </Fact>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-navy-900">Essay structure</h2>
          <span className="text-xs text-slate-500">
            {data.sections.length} sections · {total}/{session.word_limit} words
          </span>
        </div>
        <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Word budget by section">
          {data.sections.map((s, i) => (
            <span key={i} title={`${s.title}: ${s.word_count} words`} style={{ width: `${(s.word_count / Math.max(total, 1)) * 100}%`, background: BAR[i % BAR.length] }} />
          ))}
        </div>
        <ol className="mt-4 space-y-3">
          {data.sections.map((s, i) => (
            <li key={i} className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" style={{ borderLeft: `4px solid ${BAR[i % BAR.length]}` }}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-semibold text-navy-900">
                  {i + 1}. {s.title}
                </h3>
                <span className="shrink-0 text-sm font-medium text-slate-500">{s.word_count} words</span>
              </div>
              {s.purpose && <p className="mt-0.5 text-xs text-slate-500">{s.purpose}</p>}
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{s.guidance}</p>
              {s.student_material.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-slate-500">Your material</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-navy-900">
                    {s.student_material.map((m, j) => (
                      <li key={j}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ListCard title="Opening ideas" items={data.hook_options} />
        <ListCard title="Gaps to fill before you write" items={data.gaps_to_fill} />
        <ListCard title="Watch out for" items={data.avoid} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="font-semibold text-navy-900">Connecting to {college}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{data.college_connection}</p>
          <h3 className="mt-4 font-semibold text-navy-900">Tone &amp; voice</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{data.tone_and_voice}</p>
        </div>
      </section>

      {answers.size > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-navy-900">Your brainstorming answers</h2>
          <ol className="mt-3 space-y-3">
            {(session.questions ?? []).map((q, i) => (
              <li key={i} className="rounded-xl bg-lilac-50 p-4 ring-1 ring-lilac-100">
                <p className="text-sm font-semibold text-navy-900">
                  {i + 1}. {q.label}
                </p>
                <p className="text-xs text-slate-500">{q.question}</p>
                <p className="mt-2 text-sm leading-relaxed text-navy-900">{answers.get(i + 1) ?? "Not answered."}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className="pb-6 text-center text-xs text-slate-400">
        Generated by Ivy, your AI essay coach. This is a plan — write the essay in your own words.
      </p>
    </main>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-sm leading-relaxed text-navy-900">{children}</p>
    </div>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-navy-900">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}
