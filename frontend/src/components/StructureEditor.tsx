"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useHeader } from "@/lib/header";
import { headerFor, type EssayStructure, type Section } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { InstructionsCard } from "./InstructionsCard";

/** Scale budgets so they sum exactly to `limit` (largest remainder), like the backend does. */
function rebalance(sections: Section[], limit: number): Section[] {
  const raw = sections.map((s) => Math.max(1, s.word_count || 1));
  const total = raw.reduce((a, b) => a + b, 0);
  const scaled = raw.map((r) => (r * limit) / total);
  const floors = scaled.map(Math.floor);
  const order = scaled.map((x, i) => [x - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < limit - floors.reduce((a, b) => a + b, 0); k++) floors[order[k][1]]++;
  return sections.map((s, i) => ({ ...s, word_count: floors[i] }));
}

const blank: Section = { title: "New section", purpose: "", word_count: 50, guidance: "", student_material: [] };

/** Review & Edit Structure: the student's own pass over the plan before the final report. */
export function StructureEditor({ id }: { id: string }) {
  const router = useRouter();
  const { session, error: loadError } = useSession(id);
  // The student's edits; until the first one, show the saved structure.
  const [draft, setData] = useState<EssayStructure | null>(null);
  const data = draft ?? session?.structure ?? null;
  const [saving, setSaving] = useState<"" | "save" | "finish">("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useHeader(headerFor(session, "Review & Edit Structure"));

  if (!session || !data) {
    return (
      <p className="p-10 text-center text-slate-500">
        {loadError || (session && !session.structure ? "There's no structure to edit yet." : "Loading…")}
      </p>
    );
  }

  const limit = session.word_limit;
  const total = data.sections.reduce((t, s) => t + (Number(s.word_count) || 0), 0);
  const edit = (patch: Partial<EssayStructure>) => {
    setData({ ...data, ...patch });
    setSaved(false);
  };
  const editSection = (i: number, patch: Partial<Section>) =>
    edit({ sections: data.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => {
    const next = [...data.sections];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    edit({ sections: next });
  };

  const save = async (finish: boolean) => {
    setSaving(finish ? "finish" : "save");
    setError("");
    try {
      await api.saveStructure(id, {
        sections: data.sections.map((s) => ({ ...s, student_material: s.student_material.map((m) => m.trim()).filter(Boolean) })),
        working_title: data.working_title,
        central_theme: data.central_theme,
        thesis: data.thesis,
      });
      if (finish) {
        await api.complete(id);
        router.push(`/session/${id}/report`);
        return;
      }
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
    setSaving("");
  };

  return (
    <main className="mx-auto w-full max-w-4xl space-y-5 px-4 py-6">
      <InstructionsCard
        items={[
          "This is your essay structure. Every part is editable: titles, word budgets, guidance and your material.",
          `The word budgets should add up to your ${limit}-word limit. Use “Balance to ${limit}” to scale them automatically.`,
          "Use the arrows to reorder sections, or add and remove sections to fit your story.",
          "When it feels right, click Finish & view report to get your final essay structure report and PDF.",
        ]}
      />

      <section className="gradient-card space-y-4 rounded-2xl p-5 shadow-sm">
        <label className="block">
          <span className="label">Working title</span>
          <input className="field" value={data.working_title} onChange={(e) => edit({ working_title: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Central theme</span>
          <input className="field" value={data.central_theme} onChange={(e) => edit({ central_theme: e.target.value })} />
        </label>
        <label className="block">
          <span className="label">Thesis</span>
          <textarea className="field" rows={2} value={data.thesis} onChange={(e) => edit({ thesis: e.target.value })} />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-navy-900">Sections</h2>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            total === limit ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {total}/{limit} words
        </span>
        {total !== limit && (
          <button onClick={() => edit({ sections: rebalance(data.sections, limit) })} className="text-xs font-medium text-ivy-600 hover:underline">
            Balance to {limit}
          </button>
        )}
      </div>

      <ol className="space-y-4">
        {data.sections.map((s, i) => (
          <li key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ivy-50 text-xs font-semibold text-ivy-700">{i + 1}</span>
              <label className="block min-w-40 flex-1">
                <span className="label">Section</span>
                <input className="field" value={s.title} onChange={(e) => editSection(i, { title: e.target.value })} />
              </label>
              <label className="block w-28">
                <span className="label">Words</span>
                <input
                  type="number"
                  min={0}
                  className="field"
                  value={s.word_count}
                  onChange={(e) => editSection(i, { word_count: Number(e.target.value) })}
                />
              </label>
              <div className="flex gap-1 pb-1">
                <IconButton label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</IconButton>
                <IconButton label="Move down" disabled={i === data.sections.length - 1} onClick={() => move(i, 1)}>↓</IconButton>
                <IconButton
                  label="Remove section"
                  disabled={data.sections.length === 1}
                  onClick={() => edit({ sections: data.sections.filter((_, j) => j !== i) })}
                >
                  ✕
                </IconButton>
              </div>
            </div>
            <label className="mt-3 block">
              <span className="label">Guidance</span>
              <textarea className="field" rows={3} value={s.guidance} onChange={(e) => editSection(i, { guidance: e.target.value })} />
            </label>
            <label className="mt-3 block">
              <span className="label">
                Your material <span className="font-normal text-slate-400">(one per line)</span>
              </span>
              <textarea
                className="field"
                rows={Math.max(2, s.student_material.length)}
                value={s.student_material.join("\n")}
                onChange={(e) => editSection(i, { student_material: e.target.value.split("\n") })}
              />
            </label>
          </li>
        ))}
      </ol>

      <button
        onClick={() => edit({ sections: [...data.sections, blank] })}
        disabled={data.sections.length >= 12}
        className="w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-medium text-slate-500 hover:border-ivy-300 hover:text-ivy-600"
      >
        + Add section
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
        {session.status === "structuring" && (
          <Link href={`/session/${id}`} className="text-sm font-medium text-slate-500 hover:text-navy-900">
            ← Back to Ivy
          </Link>
        )}
        <span className="ml-auto text-xs text-slate-500">{saved ? "Saved" : ""}</span>
        <button onClick={() => save(false)} disabled={!!saving} className="btn-secondary text-sm">
          {saving === "save" ? "Saving…" : "Save"}
        </button>
        <button onClick={() => save(true)} disabled={!!saving} className="btn-primary text-sm">
          {saving === "finish" ? "Finishing…" : "Finish & view report"} <span aria-hidden>→</span>
        </button>
      </div>
    </main>
  );
}

function IconButton({ label, children, ...props }: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg text-sm text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-30"
    >
      {children}
    </button>
  );
}
