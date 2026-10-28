import type { EssayPrompt, EssayStructure, Section, Session } from "./types";
import type { Provider, VoiceCredentials } from "./voice/types";

// Requests go to /api/* on the Next server, which proxies them to Django
// (see app/api/[...path]/route.ts), so the browser never needs CORS or a backend URL.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith("/auth/") && typeof window !== "undefined") {
    // Session expired or never logged in: send them to log in, then back here.
    // A full navigation (not router.push) is deliberate: this isn't a component,
    // and it clears any state that belonged to the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface NewSession {
  student_name: string;
  college: string;
  grade?: string;
  word_limit?: number;
  /** A library prompt's slug, or leave empty and give essay_title + prompt_text. */
  prompt?: string;
  essay_title?: string;
  prompt_text?: string;
}

const post = <T>(path: string, data: unknown = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(data) });

export const api = {
  me: () => request<{ user: User | null }>("/auth/me"),
  login: (email: string, password: string) => post<User>("/auth/login", { email, password }),
  register: (name: string, email: string, password: string) => post<User>("/auth/register", { name, email, password }),
  logout: () => post("/auth/logout"),
  authConfig: () => request<{ google_client_id: string | null }>("/auth/config"),
  otpRequest: (email: string) => post<{ ok: boolean; expires_in: number }>("/auth/otp/request", { email }),
  otpVerify: (email: string, code: string, name?: string) => post<User>("/auth/otp/verify", { email, code, name }),
  forgotPassword: (email: string) => post<{ ok: boolean }>("/auth/password/forgot", { email }),
  resetPassword: (uid: string, token: string, password: string) =>
    post<User>("/auth/password/reset", { uid, token, password }),
  google: (credential: string) => post<User>("/auth/google", { credential }),
  health: () =>
    request<{ ok: boolean; provider: Provider; api_key: boolean; voice_model: string; llm_model: string }>("/health"),
  prompts: () => request<EssayPrompt[]>("/prompts"),
  sessions: () => request<Session[]>("/sessions"),
  createSession: (data: NewSession) => post<Session>("/sessions", data),
  session: (id: string) => request<Session>(`/sessions/${id}`),
  voiceToken: (id: string) => post<VoiceCredentials>(`/sessions/${id}/realtime`),
  guard: (text: string) => post<{ blocked: string | null; message: string }>("/guard", { text }),
  addTurn: (id: string, turn: { role: string; text: string; seq: number; question?: number }) =>
    post(`/sessions/${id}/turns`, turn),
  setQuestion: (id: string, number: number) => post(`/sessions/${id}/question`, { number }),
  saveAnswer: (id: string, number: number, text: string) => post(`/sessions/${id}/answers`, { number, text }),
  finalize: (id: string, summary?: string) => post<{ status: string }>(`/sessions/${id}/finalize`, { summary }),
  updateSection: (id: string, number: number, section: Partial<Section>) =>
    post<{ number: number; section: Section }>(`/sessions/${id}/structure/sections/${number}`, section),
  saveStructure: (id: string, data: Pick<EssayStructure, "sections"> & Partial<EssayStructure>) =>
    request<EssayStructure>(`/sessions/${id}/structure`, { method: "PUT", body: JSON.stringify(data) }),
  complete: (id: string) => post<Session>(`/sessions/${id}/complete`),
  /** Same-origin URL; the browser downloads it with the login cookie. */
  reportPdfUrl: (id: string) => `/api/sessions/${id}/report.pdf`,
};
