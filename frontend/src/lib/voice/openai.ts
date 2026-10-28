/**
 * OpenAI Realtime client over WebRTC.
 *
 * Audio flows browser <-> OpenAI directly; control events use the
 * "oai-events" data channel. The ephemeral key already carries the
 * interviewer prompt, voice and tools.
 */

import { getMic, type VoiceClient, type VoiceCredentials, type VoiceEvent } from "./types";

const CALLS_URL = "https://api.openai.com/v1/realtime/calls";

type RtEvent = { type: string; [key: string]: unknown };

export class OpenAIRealtimeClient implements VoiceClient {
  micAnalyser: AnalyserNode | null = null;
  botAnalyser: AnalyserNode | null = null;

  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private mic: MediaStream | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private botText = new Map<string, string>();

  constructor(private emit: (e: VoiceEvent) => void) {}

  async connect(cred: VoiceCredentials) {
    this.mic = await getMic();
    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.audioCtx = new AudioContext();
    this.micAnalyser = this.analyse(this.mic);

    this.audioEl = new Audio();
    this.audioEl.autoplay = true;
    pc.ontrack = (e) => {
      this.audioEl!.srcObject = e.streams[0];
      this.botAnalyser = this.analyse(e.streams[0]);
    };
    pc.addTrack(this.mic.getAudioTracks()[0], this.mic);

    const dc = pc.createDataChannel("oai-events");
    this.dc = dc;
    dc.onmessage = (m) => this.onEvent(JSON.parse(m.data));
    const opened = new Promise<void>((resolve, reject) => {
      dc.onopen = () => resolve();
      setTimeout(() => reject(new Error("Timed out opening the realtime data channel")), 15000);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const res = await fetch(CALLS_URL, {
      method: "POST",
      body: offer.sdp,
      headers: { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/sdp" },
    });
    if (!res.ok) throw new Error(`Realtime connection failed (${res.status}): ${await res.text()}`);
    await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
    await opened;
  }

  private analyse(stream: MediaStream) {
    const analyser = this.audioCtx!.createAnalyser();
    analyser.fftSize = 512;
    this.audioCtx!.createMediaStreamSource(stream).connect(analyser);
    return analyser;
  }

  private onEvent(e: RtEvent) {
    switch (e.type) {
      case "input_audio_buffer.speech_started":
        this.emit({ type: "user_speaking" });
        break;
      case "input_audio_buffer.committed":
        // Reserve the student's slot now so their words stay ahead of Ivy's
        // reply even though transcription lands later.
        this.emit({ type: "user_text", id: e.item_id as string, text: "", final: false });
        break;
      case "conversation.item.input_audio_transcription.completed":
        this.emit({
          type: "user_text",
          id: e.item_id as string,
          text: String(e.transcript ?? "").trim() || "(inaudible)",
          final: true,
        });
        break;
      case "conversation.item.input_audio_transcription.failed":
        this.emit({ type: "user_text", id: e.item_id as string, text: "(couldn't transcribe)", final: true });
        break;
      case "response.created":
        this.emit({ type: "bot_thinking" });
        break;
      case "response.output_audio_transcript.delta": {
        const id = e.item_id as string;
        const text = (this.botText.get(id) ?? "") + String(e.delta);
        this.botText.set(id, text);
        this.emit({ type: "bot_speaking" });
        this.emit({ type: "bot_text", id, text, final: false });
        break;
      }
      case "response.output_audio_transcript.done": {
        const id = e.item_id as string;
        this.botText.delete(id);
        this.emit({ type: "bot_text", id, text: String(e.transcript ?? ""), final: true });
        break;
      }
      case "response.function_call_arguments.done": {
        let args: Record<string, string> = {};
        try {
          args = JSON.parse((e.arguments as string) || "{}");
        } catch {}
        this.emit({ type: "tool_call", id: e.call_id as string, name: e.name as string, args });
        break;
      }
      case "response.done": {
        const output = ((e.response as { output?: { type: string }[] })?.output ?? []) as { type: string }[];
        // A tool-only response leaves Ivy silent; nudge her to keep talking.
        // If she already spoke she's now waiting for the student.
        if (output.some((o) => o.type === "function_call") && !output.some((o) => o.type === "message")) {
          this.send({ type: "response.create" });
        }
        break;
      }
      case "output_audio_buffer.stopped":
        this.emit({ type: "bot_idle" });
        break;
      case "error": {
        const msg = (e.error as { message?: string } | undefined)?.message;
        if (msg && !/active response/i.test(msg)) this.emit({ type: "error", message: msg });
        break;
      }
    }
  }

  private send(event: RtEvent) {
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(event));
  }

  start() {
    this.send({ type: "response.create" });
  }

  sendToolResult(id: string, _name: string, result: Record<string, unknown>) {
    // The follow-up response (if any) is triggered from response.done.
    this.send({
      type: "conversation.item.create",
      item: { type: "function_call_output", call_id: id, output: JSON.stringify(result) },
    });
  }

  sendText(text: string) {
    this.send({
      type: "conversation.item.create",
      item: { type: "message", role: "user", content: [{ type: "input_text", text }] },
    });
    this.send({ type: "response.create" });
  }

  setMuted(muted: boolean) {
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  setHeadphones() {
    // WebRTC's built-in echo cancellation already handles speakers.
  }

  disconnect() {
    this.dc?.close();
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.pc?.close();
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.audioEl) this.audioEl.srcObject = null;
    this.audioCtx?.close().catch(() => {});
    this.pc = this.dc = this.mic = this.audioEl = this.audioCtx = null;
    this.micAnalyser = this.botAnalyser = null;
  }
}
