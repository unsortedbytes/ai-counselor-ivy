import { GeminiLiveClient } from "./gemini";
import { OpenAIRealtimeClient } from "./openai";
import type { Provider, VoiceClient, VoiceEvent } from "./types";

export * from "./types";

export function createVoiceClient(provider: Provider, onEvent: (e: VoiceEvent) => void): VoiceClient {
  return provider === "openai" ? new OpenAIRealtimeClient(onEvent) : new GeminiLiveClient(onEvent);
}
