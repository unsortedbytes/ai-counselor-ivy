"use client";

import { useEffect, useState } from "react";

/** The "Instructions" card at the top of each stage, with Read more and Listen (text-to-speech). */
export function InstructionsCard({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const listen = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(items.join(" "));
    u.rate = 1;
    u.onend = u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };

  const shown = open ? items : items.slice(0, 2);
  return (
    <section className="gradient-card-warm rounded-2xl px-5 py-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h2 className="font-semibold text-navy-900">Instructions</h2>
        <button
          onClick={listen}
          className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-orange-50/60 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
          aria-pressed={speaking}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {speaking ? <path d="M22 9l-6 6M16 9l6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
          </svg>
          {speaking ? "Stop" : "Listen"}
        </button>
      </div>
      <ol className="mt-2 space-y-0.5 text-xs leading-relaxed text-slate-600">
        {shown.map((t, i) => (
          <li key={i} className={open ? "" : "truncate"}>
            {i + 1}. {t}
          </li>
        ))}
      </ol>
      {items.length > 0 && (
        <button onClick={() => setOpen(!open)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-ivy-600">
          {open ? "Show less" : "Read more"}
          <span className={`grid h-3.5 w-3.5 place-items-center rounded-full border border-ivy-600 text-[8px] transition ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </button>
      )}
    </section>
  );
}
