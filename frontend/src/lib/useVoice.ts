"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Stage, Turn } from "./types";
import { createVoiceClient, type VoiceClient, type VoiceEvent } from "./voice";

export type ConnState = "idle" | "connecting" | "live" | "reconnecting" | "ending" | "error";
export type Activity = "listening" | "user" | "thinking" | "speaking";
export type LiveTurn = Turn & { key: string; pending?: boolean };

// If Ivy ends the call but her goodbye never finishes playing, move on anyway.
const END_FALLBACK_MS = 15000;

type Options = {
  id: string;
  stage: Stage;
  initialTurns: Turn[];
  /** Handles the stage's tools; the returned object is sent back to the model. */
  onTool: (name: string, args: Record<string, unknown>) => Record<string, unknown>;
  /** Tool names that mean "Ivy is saying goodbye": once she's done talking, `onEnd` runs. */
  endTools: string[];
  onEnd: (args: Record<string, unknown>) => void;
  /** Capture question to tag new turns with (0 = none). */
  currentQuestion?: () => number;
};

/** One live voice call with Ivy: connection, transcript, persistence and tool calls. */
export function useVoice({ id, stage, initialTurns, onTool, endTools, onEnd, currentQuestion }: Options) {
  const [conn, setConn] = useState<ConnState>("idle");
  const [activity, setActivity] = useState<Activity>("listening");
  const [error, setError] = useState("");
  const [turns, setTurns] = useState<LiveTurn[]>(() => initialTurns.map((t, i) => ({ ...t, key: `db-${i}` })));
  const [muted, setMuted] = useState(false);
  const [headphones, setHeadphones] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const client = useRef<VoiceClient | null>(null);
  const seq = useRef(initialTurns.reduce((m, t) => Math.max(m, t.seq), 0));
  const turnMeta = useRef(new Map<string, { seq: number; question: number }>());
  const pending = useRef<Promise<unknown>[]>([]);
  const ending = useRef<Record<string, unknown> | null>(null);
  const ended = useRef(false);
  // Latest callbacks, so the event handler never sees stale ones.
  const handlers = useRef({ onTool, onEnd, currentQuestion });
  useEffect(() => {
    handlers.current = { onTool, onEnd, currentQuestion };
  });

  useEffect(() => {
    if (conn !== "live") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [conn]);

  useEffect(() => () => client.current?.disconnect(), []);

  const track = useCallback((p: Promise<unknown>) => {
    pending.current.push(p.catch((e) => console.warn("persist failed", e)));
  }, []);

  /** Each turn gets its order (and question) the moment it first appears, not when it's final. */
  const metaFor = (key: string) => {
    if (!turnMeta.current.has(key)) {
      turnMeta.current.set(key, { seq: ++seq.current, question: handlers.current.currentQuestion?.() ?? 0 });
    }
    return turnMeta.current.get(key)!;
  };

  const upsertTurn = useCallback((key: string, role: Turn["role"], text: string, pendingText: boolean) => {
    const meta = metaFor(key);
    setTurns((prev) => {
      const i = prev.findIndex((t) => t.key === key);
      if (i === -1) {
        const turn: LiveTurn = { key, role, text, seq: meta.seq, question: meta.question, stage, pending: pendingText };
        return [...prev, turn].sort((a, b) => a.seq - b.seq);
      }
      const next = [...prev];
      next[i] = { ...next[i], text, pending: pendingText };
      return next;
    });
    return meta;
  }, [stage]);

  const persist = useCallback(
    (key: string, role: Turn["role"], text: string) => {
      const meta = metaFor(key);
      track(api.addTurn(id, { role, text, seq: meta.seq, question: meta.question }));
    },
    [id, track],
  );

  /** Disconnect and wait until every turn and tool result has been saved. */
  const stop = useCallback(async () => {
    client.current?.disconnect();
    client.current = null;
    await Promise.all(pending.current);
  }, []);

  const finish = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    setConn("ending");
    handlers.current.onEnd(ending.current ?? {});
  }, []);

  const onEvent = useCallback(
    (e: VoiceEvent) => {
      switch (e.type) {
        case "user_speaking":
          setActivity("user");
          break;
        case "user_text":
          upsertTurn(e.id, "user", e.text, !e.final);
          if (e.final && e.text) persist(e.id, "user", e.text);
          break;
        case "bot_thinking":
          setActivity("thinking");
          break;
        case "bot_speaking":
          setActivity("speaking");
          break;
        case "bot_text":
          upsertTurn(e.id, "assistant", e.text, false);
          if (e.final && e.text) persist(e.id, "assistant", e.text);
          break;
        case "bot_idle":
          setActivity("listening");
          // Ivy's goodbye has finished playing: wrap up.
          if (ending.current) finish();
          break;
        case "tool_call": {
          const rt = client.current;
          let result: Record<string, unknown>;
          try {
            result = handlers.current.onTool(e.name, e.args);
          } catch (err) {
            result = { error: (err as Error).message };
          }
          rt?.sendToolResult(e.id, e.name, result);
          if (endTools.includes(e.name)) {
            ending.current = e.args;
            setTimeout(finish, END_FALLBACK_MS);
          }
          break;
        }
        case "reconnecting":
          setConn("reconnecting");
          break;
        case "reconnected":
          setConn("live");
          break;
        case "error":
          console.error("voice error", e.message);
          setError(e.message);
          break;
      }
    },
    [endTools, finish, persist, upsertTurn],
  );

  const start = async () => {
    setError("");
    setConn("connecting");
    ended.current = false;
    try {
      const cred = await api.voiceToken(id);
      const rt = createVoiceClient(cred.provider, onEvent);
      client.current = rt;
      rt.setHeadphones(headphones);
      await rt.connect(cred);
      setConn("live");
      rt.start(); // Ivy speaks first
    } catch (e) {
      client.current?.disconnect();
      client.current = null;
      setConn("error");
      setError((e as Error).message);
    }
  };

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    client.current?.setMuted(m);
  };

  const toggleHeadphones = () => {
    const h = !headphones;
    setHeadphones(h);
    client.current?.setHeadphones(h);
  };

  const sendText = async (text: string) => {
    if (!client.current) return;
    const key = `typed-${Date.now()}`;
    upsertTurn(key, "user", text, false);
    // Off-topic or injected messages never reach the model; Ivy redirects locally.
    // If the check itself fails, fall back to the model's own guardrails.
    const verdict = await api.guard(text).catch(() => null);
    if (verdict?.blocked) {
      upsertTurn(`${key}-guard`, "assistant", verdict.message, false);
      return;
    }
    if (!client.current) return;
    persist(key, "user", text);
    client.current.sendText(text);
    setActivity("thinking");
  };

  const getAnalysers = useCallback(
    () => ({ mic: client.current?.micAnalyser ?? null, bot: client.current?.botAnalyser ?? null }),
    [],
  );

  return {
    conn,
    setConn,
    live: conn === "live" || conn === "reconnecting",
    activity,
    error,
    setError,
    turns,
    muted,
    toggleMute,
    headphones,
    toggleHeadphones,
    elapsed,
    start,
    stop,
    sendText,
    track,
    getAnalysers,
  };
}

export type Voice = ReturnType<typeof useVoice>;

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
