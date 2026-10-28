"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { EssayStructure, Section, Session } from "@/lib/types";
import { mmss, useVoice } from "@/lib/useVoice";
import { HourglassIcon } from "./CaptureRoom";
import { ChatThread } from "./ChatThread";
import { InstructionsCard } from "./InstructionsCard";
import { VoiceBar } from "./VoiceBar";

const END_TOOLS = ["end_structure"];

/** Stage 2 — Ivy walks the student through the draft structure and refines it live. */
export function StructureRoom({ session }: { session: Session }) {
  const router = useRouter();
  const [structure, setStructure] = useState<EssayStructure>(session.structure!);
  const [flash, setFlash] = useState<{ n: number; at: number } | null>(null);
  const flashCount = useRef(0);
  const [leaving, setLeaving] = useState(false);

  const review = async () => {
    setLeaving(true);
    await voice.stop();
    router.push(`/session/${session.id}/review`);
  };

  const voice = useVoice({
    id: session.id,
    stage: "structure",
    initialTurns: (session.turns ?? []).filter((t) => t.stage === "structure"),
    endTools: END_TOOLS,
    onTool: (name, args) => {
      if (name === "update_section") {
        const n = Number(args.number);
        if (!(n >= 1 && n <= structure.sections.length)) return { error: `section must be 1–${structure.sections.length}` };
        const patch: Partial<Section> = { guidance: String(args.guidance ?? "") };
        if (Array.isArray(args.student_material)) patch.student_material = args.student_material.map(String);
        if (args.word_count != null && Number.isFinite(Number(args.word_count))) patch.word_count = Number(args.word_count);
        setStructure((s) => ({ ...s, sections: s.sections.map((x, i) => (i === n - 1 ? { ...x, ...patch } : x)) }));
        setFlash({ n, at: ++flashCount.current });
        voice.track(api.updateSection(session.id, n, patch));
        return { result: "updated" };
      }
      if (name === "end_structure") return { result: "ok" };
      return { error: `unknown tool ${name}` };
    },
    onEnd: () => review(),
  });

  const total = structure.sections.reduce((t, s) => t + (s.word_count || 0), 0);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6">
      <InstructionsCard
        items={[
          "Based on your inputs, a draft essay structure has been created.",
          "This essay structure outlines your story flow from introduction to conclusion, while staying aligned with the essay prompt.",
          "Ivy will go through it section by section and ask a question or two to make each part stronger. The structure on the right updates as you talk.",
          "When you're happy with it, click Review & Edit Structure to fine-tune it yourself.",
        ]}
      />

      <section className="gradient-card flex h-[70vh] min-h-[520px] flex-col overflow-hidden rounded-2xl shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 text-sm">
          <h2 className="font-semibold text-navy-900">Lets start building the essay structure</h2>
          <span className="ml-auto flex items-center gap-1.5 font-medium text-navy-900">
            <HourglassIcon /> {mmss(voice.elapsed)} mins
          </span>
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[3fr_2fr]">
          <div className="flex min-h-0 flex-col md:border-r md:border-slate-200">
            <div className="min-h-0 flex-1">
              <ChatThread
                turns={voice.turns}
                studentName={session.student_name}
                empty="Press “Start talking to Ivy” and she'll walk you through your draft structure."
              />
            </div>
            <VoiceBar voice={voice} hasTurns={voice.turns.length > 0} idleHint="Your draft structure is ready" />
          </div>
          <aside className="hidden min-h-0 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-navy-900 md:block" aria-label="Essay structure">
            <p className="mb-3 text-xs text-slate-500">
              {structure.working_title} · {total}/{session.word_limit} words
            </p>
            <div className="space-y-5">
              {structure.sections.map((s, i) => (
                <div
                  key={flash?.n === i + 1 ? `${i}-${flash.at}` : i}
                  className={`-mx-2 rounded-lg px-2 py-1 ${flash?.n === i + 1 ? "animate-flash" : ""}`}
                >
                  <p className="font-medium">
                    {s.title}: {s.word_count} words
                  </p>
                  <p className="mt-2 text-slate-700">{s.guidance}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={review} disabled={leaving} className="btn-primary text-sm">
          Review &amp; Edit Structure <span aria-hidden>→</span>
        </button>
      </div>
    </main>
  );
}
