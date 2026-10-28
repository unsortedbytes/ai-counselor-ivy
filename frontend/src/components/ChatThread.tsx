"use client";

import { useEffect, useRef } from "react";
import type { Question } from "@/lib/types";
import type { LiveTurn } from "@/lib/useVoice";
import { IvyOrb, StudentAvatar } from "./IvyOrb";

/**
 * Ivy on the left with her orb, the student on the right in a lilac bubble.
 * With `questions`, Ivy's first message for each question is headed "4. Professional".
 */
export function ChatThread({
  turns,
  studentName,
  questions,
  empty,
}: {
  turns: LiveTurn[];
  studentName: string;
  questions?: Question[];
  empty: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll only this panel, never the page.
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const headed = new Set<number>();
  return (
    <div ref={box} className="h-full overflow-y-auto px-5 py-4 [scrollbar-color:#c7cbe0_transparent]">
      {!turns.length && <p className="py-16 text-center text-sm text-slate-400">{empty}</p>}
      <div className="space-y-5">
        {turns.map((t) => {
          if (t.role === "user") {
            return (
              <div key={t.key} className="flex items-start justify-end gap-3">
                <div className="max-w-[78%] rounded-xl bg-lilac-50 px-4 py-3 text-sm leading-relaxed text-navy-900 ring-1 ring-lilac-100">
                  {t.text || <span className="italic text-slate-400">transcribing…</span>}
                </div>
                <StudentAvatar name={studentName} />
              </div>
            );
          }
          const q = t.question && questions?.[t.question - 1];
          const heading = q && !headed.has(t.question) ? `${t.question}. ${q.label}` : "";
          if (heading) headed.add(t.question);
          return (
            <div key={t.key} className="flex items-start gap-3">
              <IvyOrb size={36} animated={false} />
              <div className="max-w-[80%] pt-1.5 text-sm leading-relaxed text-navy-900">
                {heading && <p className="mb-0.5 font-semibold">{heading}</p>}
                {t.text || <span className="text-slate-400">…</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
