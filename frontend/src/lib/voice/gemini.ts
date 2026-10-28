/**
 * Gemini Live API client over a raw WebSocket.
 *
 * Audio in:  mic → AudioWorklet → 16 kHz PCM16 → base64 → `realtimeInput.audio`
 * Audio out: `modelTurn` PCM16 @ 24 kHz → scheduled AudioBuffers (gapless)
 * The ephemeral token already locks the prompt, tools and voice; we only add
 * `sessionResumption` so Gemini's periodic socket recycling is invisible.
 */

import { getMic, type VoiceClient, type VoiceCredentials, type VoiceEvent } from "./types";

const IN_RATE = 16000;
const OUT_RATE = 24000;

// Float32 → Int16 in ~100 ms chunks, off the main thread.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(${IN_RATE / 10}); this.n = 0; }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.buffer.slice(0)); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

type Part = { inlineData?: { mimeType: string; data: string } };
type ServerContent = {
  modelTurn?: { parts?: Part[] };
  inputTranscription?: { text?: string };
  outputTranscription?: { text?: string };
  interrupted?: boolean;
  turnComplete?: boolean;
};
type FunctionCall = { id: string; name: string; args?: Record<string, string> };
type ServerMessage = {
  setupComplete?: object;
  serverContent?: ServerContent;
  toolCall?: { functionCalls: FunctionCall[] };
  goAway?: object;
  sessionResumptionUpdate?: { newHandle?: string; resumable?: boolean };
  error?: { message?: string };
};

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function pcm16ToFloat(b64: string) {
  const bin = atob(b64);
  const out = new Float32Array(bin.length / 2);
  for (let i = 0; i < out.length; i++) {
    let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 0x8000;
  }
  return out;
}

export class GeminiLiveClient implements VoiceClient {
  micAnalyser: AnalyserNode | null = null;
  botAnalyser: AnalyserNode | null = null;

  private ws: WebSocket | null = null;
  private cred: VoiceCredentials | null = null;
  private mic: MediaStream | null = null;
  private inCtx: AudioContext | null = null;
  private outCtx: AudioContext | null = null;
  private outGain: GainNode | null = null;
  private playing = new Set<AudioBufferSourceNode>();
  private nextPlayTime = 0;

  private muted = false;
  private headphones = false;
  private closedByUs = false;
  private resumeHandle: string | null = null;

  // Turn bookkeeping: transcripts stream in chunks and must be stitched together.
  private turnCounter = 0;
  private user: { id: string; text: string } | null = null;
  private bot: { id: string; text: string; audio: boolean } | null = null;
  private turnDone = false;

  constructor(private emit: (e: VoiceEvent) => void) {}

  async connect(cred: VoiceCredentials) {
    this.cred = cred;
    this.mic = await getMic();

    this.outCtx = new AudioContext({ sampleRate: OUT_RATE });
    this.outGain = this.outCtx.createGain();
    this.botAnalyser = this.outCtx.createAnalyser();
    this.botAnalyser.fftSize = 512;
    this.outGain.connect(this.botAnalyser).connect(this.outCtx.destination);

    this.inCtx = new AudioContext({ sampleRate: IN_RATE });
    const src = this.inCtx.createMediaStreamSource(this.mic);
    this.micAnalyser = this.inCtx.createAnalyser();
    this.micAnalyser.fftSize = 512;
    src.connect(this.micAnalyser);
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await this.inCtx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const worklet = new AudioWorkletNode(this.inCtx, "pcm-capture");
    worklet.port.onmessage = (e) => this.onMicChunk(e.data as ArrayBuffer);
    // A silent sink keeps the worklet in the rendering graph.
    const sink = this.inCtx.createGain();
    sink.gain.value = 0;
    src.connect(worklet).connect(sink).connect(this.inCtx.destination);

    await this.openSocket();
  }

  private openSocket(): Promise<void> {
    const { token, model, ws_url } = this.cred!;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${ws_url}?access_token=${encodeURIComponent(token)}`);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      let ready = false;
      const timer = setTimeout(() => reject(new Error("Timed out connecting to Gemini Live")), 15000);

      ws.onopen = () => {
        const setup: Record<string, unknown> = { model: `models/${model}`, sessionResumption: {} };
        if (this.resumeHandle) setup.sessionResumption = { handle: this.resumeHandle };
        ws.send(JSON.stringify({ setup }));
      };
      ws.onmessage = (e) => {
        const raw = typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer);
        const msg = JSON.parse(raw) as ServerMessage;
        if (msg.setupComplete && !ready) {
          ready = true;
          clearTimeout(timer);
          resolve();
          return;
        }
        this.onMessage(msg);
      };
      ws.onclose = (e) => {
        clearTimeout(timer);
        if (!ready) {
          reject(new Error(`Gemini Live closed the connection (${e.code}) ${e.reason}`));
          return;
        }
        if (!this.closedByUs && ws === this.ws) this.reconnect(e.reason);
      };
    });
  }

  /** Gemini recycles sockets (GoAway, ~10 min); resume the same conversation. */
  private async reconnect(reason?: string) {
    if (this.closedByUs) return;
    if (!this.resumeHandle) {
      this.emit({ type: "error", message: `Voice connection closed${reason ? `: ${reason}` : ""}` });
      return;
    }
    this.emit({ type: "reconnecting" });
    this.stopPlayback();
    try {
      await this.openSocket();
      this.emit({ type: "reconnected" });
    } catch (e) {
      this.emit({ type: "error", message: (e as Error).message });
    }
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private botAudible() {
    return !!this.outCtx && this.outCtx.currentTime < this.nextPlayTime + 0.3;
  }

  private onMicChunk(buf: ArrayBuffer) {
    if (this.muted) return;
    // On speakers, Ivy would hear (and answer) herself; hold the mic while she talks.
    if (!this.headphones && this.botAudible()) return;
    this.send({ realtimeInput: { audio: { data: toBase64(buf), mimeType: `audio/pcm;rate=${IN_RATE}` } } });
  }

  private onMessage(msg: ServerMessage) {
    if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate.newHandle) {
      this.resumeHandle = msg.sessionResumptionUpdate.newHandle;
    }
    if (msg.goAway) {
      const old = this.ws;
      this.ws = null;
      old?.close();
      this.reconnect("server recycling connection");
      return;
    }
    if (msg.error) this.emit({ type: "error", message: msg.error.message ?? "Gemini error" });

    for (const fc of msg.toolCall?.functionCalls ?? []) {
      this.emit({ type: "tool_call", id: fc.id, name: fc.name, args: fc.args ?? {} });
    }

    const sc = msg.serverContent;
    if (!sc) return;

    const heard = sc.inputTranscription?.text;
    if (heard) {
      if (!this.user) {
        this.user = { id: `u${++this.turnCounter}`, text: "" };
        this.emit({ type: "user_speaking" });
      }
      this.user.text += heard;
      this.emit({ type: "user_text", id: this.user.id, text: this.user.text.trim(), final: false });
    }

    for (const p of sc.modelTurn?.parts ?? []) {
      if (p.inlineData?.mimeType.startsWith("audio/pcm")) this.enqueue(p.inlineData.data);
    }

    const said = sc.outputTranscription?.text;
    if (said) {
      this.ensureBot();
      this.bot!.text += said;
      this.emit({ type: "bot_text", id: this.bot!.id, text: this.bot!.text.trim(), final: false });
    }

    if (sc.interrupted) {
      // Student barged in: drop queued audio and close Ivy's (cut-off) turn.
      this.stopPlayback();
      this.finishBotTurn();
      this.emit({ type: "user_speaking" });
    }

    if (sc.turnComplete) {
      // Tool-only turns carry no speech; Gemini follows up with a spoken turn.
      if (this.bot) {
        if (this.user) {
          this.emit({ type: "user_text", id: this.user.id, text: this.user.text.trim(), final: true });
          this.user = null;
        }
        this.finishBotTurn();
        this.turnDone = true;
        this.maybeIdle();
      }
    }
  }

  private ensureBot() {
    if (!this.bot) {
      this.bot = { id: `b${++this.turnCounter}`, text: "", audio: false };
      this.turnDone = false;
      this.emit({ type: "bot_speaking" });
    }
  }

  private finishBotTurn() {
    if (!this.bot) return;
    this.emit({ type: "bot_text", id: this.bot.id, text: this.bot.text.trim(), final: true });
    this.bot = null;
  }

  private enqueue(b64: string) {
    const ctx = this.outCtx;
    if (!ctx || !this.outGain) return;
    this.ensureBot();
    this.bot!.audio = true;
    const samples = pcm16ToFloat(b64);
    const buffer = ctx.createBuffer(1, samples.length, OUT_RATE);
    buffer.copyToChannel(samples, 0);
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.outGain);
    const at = Math.max(ctx.currentTime + 0.02, this.nextPlayTime);
    node.start(at);
    this.nextPlayTime = at + buffer.duration;
    this.playing.add(node);
    node.onended = () => {
      this.playing.delete(node);
      this.maybeIdle();
    };
  }

  private maybeIdle() {
    if (this.turnDone && this.playing.size === 0) {
      this.turnDone = false;
      this.emit({ type: "bot_idle" });
    }
  }

  private stopPlayback() {
    for (const n of this.playing) {
      n.onended = null;
      try {
        n.stop();
      } catch {}
    }
    this.playing.clear();
    this.nextPlayTime = 0;
  }

  start() {
    this.send({
      clientContent: {
        turns: [{ role: "user", parts: [{ text: "(The student has joined the call. Begin.)" }] }],
        turnComplete: true,
      },
    });
  }

  sendToolResult(id: string, name: string, result: Record<string, unknown>) {
    // SILENT: Ivy absorbs the result without interrupting what she's saying.
    this.send({ toolResponse: { functionResponses: [{ id, name, response: { ...result, scheduling: "SILENT" } }] } });
  }

  sendText(text: string) {
    this.send({ realtimeInput: { text } });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
  }

  setHeadphones(on: boolean) {
    this.headphones = on;
  }

  disconnect() {
    this.closedByUs = true;
    this.stopPlayback();
    this.ws?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.inCtx?.close().catch(() => {});
    this.outCtx?.close().catch(() => {});
    this.ws = this.mic = this.inCtx = this.outCtx = this.outGain = null;
    this.micAnalyser = this.botAnalyser = null;
  }
}
