"use client";

import { useState } from "react";
import type { Answer, Question } from "@/lib/types";

/** "Preview Answers": what Ivy captured for each question, editable before the structure is built. */
export function AnswersPreview({
  questions,
  answers,
  busy,
  onSave,
  onClose,
  onContinue,
}: {
  questions: Question[];
  answers: Answer[];
  busy: boolean;
  onSave: (number: number, text: string) => Promise<unknown>;
  onClose: () => void;
  onContinue: () => void;
}) {
  const byNumber = new Map(answers.map((a) => [a.number, a.text]));
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const missing = questions.length - answers.length;

  const save = async (n: number) => {
    setError("");
    try {
      await onSave(n, draft.trim());
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy-900/40 p-4" role="dialog" aria-modal aria-labelledby="preview-title">
      <div className="gradient-card flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="preview-title" className="font-semibold text-navy-900">
            Preview Answers
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        <ol className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {questions.map((q, i) => {
            const n = i + 1;
            const text = byNumber.get(n);
            return (
              <li key={n} className="rounded-xl bg-lilac-50 p-4 ring-1 ring-lilac-100">
                <p className="text-sm font-semibold text-navy-900">
                  {n}. {q.label}
                </p>
                <p className="text-xs text-slate-500">{q.question}</p>
                {editing === n ? (
                  <div className="mt-2">
                    <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} className="field" autoFocus />
                    <div className="mt-2 flex justify-end gap-2">
                      <button onClick={() => setEditing(null)} className="btn-secondary px-3 py-1.5 text-xs">
                        Cancel
                      </button>
                      <button onClick={() => save(n)} disabled={!draft.trim()} className="btn-primary px-3 py-1.5 text-xs">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <p className={`text-sm leading-relaxed ${text ? "text-navy-900" : "italic text-slate-400"}`}>
                      {text || "Not answered yet."}
                    </p>
                    <button
                      onClick={() => {
                        setDraft(text ?? "");
                        setEditing(n);
                      }}
                      className="shrink-0 text-xs font-medium text-ivy-600 hover:underline"
                    >
                      {text ? "Edit" : "Add"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-5 py-4">
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
          <p className="text-xs text-slate-500">
            {missing > 0 ? `${missing} question${missing === 1 ? "" : "s"} still open — you can add them here or keep talking.` : "All questions answered."}
          </p>
          <div className="ml-auto flex gap-2">
            <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">
              Keep talking
            </button>
            <button onClick={onContinue} disabled={busy || !answers.length} className="btn-primary px-4 py-2 text-sm">
              {busy ? "Building…" : "Build essay structure"} <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
