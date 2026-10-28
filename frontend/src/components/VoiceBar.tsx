"use client";

import { useCallback, useState } from "react";
import type { Activity, Voice } from "@/lib/useVoice";
import { IvyOrb } from "./IvyOrb";

const ACTIVITY_LABEL: Record<Activity, string> = {
  listening: "Listening — take your time",
  user: "Hearing you…",
  thinking: "Ivy is thinking…",
  speaking: "Ivy is speaking",
};

/** Bottom of a chat card: Ivy's orb and status, mic controls, and a typing fallback. */
export function VoiceBar({ voice, hasTurns, idleHint }: { voice: Voice; hasTurns: boolean; idleHint: string }) {
  const [draft, setDraft] = useState("");
  const { conn, live, muted, activity, getAnalysers } = voice;
  const botAnalyser = useCallback(() => getAnalysers().bot, [getAnalysers]);

  const label =
    conn === "live"
      ? muted
        ? "Mic muted"
        : ACTIVITY_LABEL[activity]
      : conn === "reconnecting"
        ? "Reconnecting…"
        : conn === "connecting"
          ? "Connecting to Ivy…"
          : conn === "ending"
            ? "Wrapping up…"
            : hasTurns
              ? "Paused — resume whenever you're ready"
              : idleHint;

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || conn !== "live") return;
    void voice.sendText(text);
    setDraft("");
  };

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <IvyOrb size={40} animated={live} getLevel={live ? botAnalyser : undefined} />
          <p className="truncate text-xs font-medium text-slate-600" aria-live="polite">
            {label}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {(conn === "idle" || conn === "error") && (
            <button onClick={voice.start} className="btn-primary px-4 py-2 text-sm">
              <MicIcon /> {hasTurns ? "Resume with Ivy" : "Start talking to Ivy"}
            </button>
          )}
          {conn === "connecting" && (
            <button disabled className="btn-primary px-4 py-2 text-sm">
              Connecting…
            </button>
          )}
          {live && (
            <button
              onClick={voice.toggleMute}
              className={`grid h-9 w-9 place-items-center rounded-full ring-1 transition ${
                muted ? "bg-red-50 text-red-600 ring-red-200" : "bg-ivy-50 text-ivy-600 ring-ivy-200"
              }`}
              title={muted ? "Unmute mic" : "Mute mic"}
              aria-label={muted ? "Unmute mic" : "Mute mic"}
            >
              <MicIcon off={muted} />
            </button>
          )}
        </div>
      </div>
      {live && (
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Prefer typing? Type your answer here…"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-ivy-500"
          />
          <button disabled={!draft.trim()} className="btn-secondary px-4 py-2 text-sm">
            Send
          </button>
        </form>
      )}
      {conn !== "ending" && (
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-slate-500">
          <input type="checkbox" checked={voice.headphones} onChange={voice.toggleHeadphones} className="accent-ivy-600" />
          I&apos;m wearing headphones (lets me interrupt Ivy)
        </label>
      )}
      {voice.error && <p className="mt-2 text-xs text-red-600">{voice.error}</p>}
    </div>
  );
}

function MicIcon({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      {off && <path d="M4 4l16 16" />}
    </svg>
  );
}
