/**
 * Provider-neutral voice layer. Each adapter (Gemini Live, OpenAI Realtime)
 * turns its wire protocol into these events, so the interview room doesn't
 * care which speech-to-speech model is on the other end.
 */

export type Provider = "gemini" | "openai";

export interface VoiceCredentials {
  provider: Provider;
  token: string;
  model: string;
  ws_url?: string;
}

export type VoiceEvent =
  | { type: "user_speaking" }
  /** `text` is the full text of that turn so far; `final` once it won't change. */
  | { type: "user_text"; id: string; text: string; final: boolean }
  | { type: "bot_thinking" }
  | { type: "bot_speaking" }
  | { type: "bot_text"; id: string; text: string; final: boolean }
  /** Ivy finished speaking (audio fully played) and is waiting for the student. */
  | { type: "bot_idle" }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { type: "reconnecting" }
  | { type: "reconnected" }
  | { type: "error"; message: string };

export interface VoiceClient {
  micAnalyser: AnalyserNode | null;
  botAnalyser: AnalyserNode | null;
  connect(cred: VoiceCredentials): Promise<void>;
  /** Have the interviewer speak first. */
  start(): void;
  sendToolResult(id: string, name: string, result: Record<string, unknown>): void;
  sendText(text: string): void;
  setMuted(muted: boolean): void;
  /** Allow barge-in. Off by default for speakers to avoid Ivy hearing herself. */
  setHeadphones(on: boolean): void;
  disconnect(): void;
}

/** 0..1 loudness of an analyser's current frame. */
export function level(analyser: AnalyserNode | null): number {
  if (!analyser) return 0;
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += ((v - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

export function getMic() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
}
