"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { EssayPrompt } from "@/lib/types";

const CUSTOM = "custom";

export function StartForm() {
  const router = useRouter();
  const { user, loading } = useAuth();
  // null = untouched, so the field shows the account's first name by default.
  const [nameInput, setNameInput] = useState<string | null>(null);
  const studentName = nameInput ?? user?.name ?? "";
  const [prompts, setPrompts] = useState<EssayPrompt[]>([]);
  const [form, setForm] = useState({ grade: "Grade 12", college: "", prompt: "", essay_title: "", prompt_text: "", word_limit: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [keyMissing, setKeyMissing] = useState("");

  useEffect(() => {
    api
      .health()
      .then((h) => setKeyMissing(h.api_key ? "" : h.provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"))
      .catch(() => setError("Can't reach the backend — is Django running on :8000?"));
  }, []);

  useEffect(() => {
    if (!user) return;
    api
      .prompts()
      .then((ps) => {
        setPrompts(ps);
        setForm((f) => (f.prompt ? f : { ...f, prompt: ps[0]?.slug ?? CUSTOM }));
      })
      .catch(() => setForm((f) => ({ ...f, prompt: CUSTOM })));
  }, [user]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const chosen = prompts.find((p) => p.slug === form.prompt);
  const custom = form.prompt === CUSTOM || !user;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push("/signup?next=/");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const s = await api.createSession({
        student_name: studentName,
        grade: form.grade,
        college: form.college,
        word_limit: form.word_limit ? Number(form.word_limit) : undefined,
        ...(custom ? { essay_title: form.essay_title, prompt_text: form.prompt_text } : { prompt: form.prompt }),
      });
      router.push(`/session/${s.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="gradient-card space-y-5 rounded-2xl p-6 shadow-xl md:p-8">
      <div>
        <h2 className="text-lg font-semibold text-navy-900">New Essay Brainstorming</h2>
        <p className="text-sm text-slate-500">Tell Ivy which essay you&apos;re working on.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Your first name</span>
          <input required className="field" value={studentName} onChange={(e) => setNameInput(e.target.value)} placeholder="Aanya" />
        </label>
        <label className="block">
          <span className="label">Grade</span>
          <select className="field" value={form.grade} onChange={set("grade")}>
            {["Grade 10", "Grade 11", "Grade 12", "Gap year"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="label">College</span>
          <input required className="field" value={form.college} onChange={set("college")} placeholder="Bryn Mawr College" />
        </label>

        {user && prompts.length > 0 && (
          <label className="block sm:col-span-2">
            <span className="label">Essay prompt</span>
            <select className="field" value={form.prompt} onChange={set("prompt")}>
              {prompts.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.title} ({p.word_limit} words)
                </option>
              ))}
              <option value={CUSTOM}>My own prompt…</option>
            </select>
            {chosen && <span className="mt-1.5 block text-xs leading-relaxed text-slate-500">{chosen.text}</span>}
          </label>
        )}

        {custom && (
          <>
            <label className="block sm:col-span-2">
              <span className="label">Essay title</span>
              <input required={!!user} className="field" value={form.essay_title} onChange={set("essay_title")} placeholder="Essay 1: Learning to let go" />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Essay prompt</span>
              <textarea
                required={!!user}
                rows={3}
                className="field"
                value={form.prompt_text}
                onChange={set("prompt_text")}
                placeholder="Paste the prompt exactly as the college wrote it"
              />
            </label>
          </>
        )}
        <label className="block">
          <span className="label">Word limit</span>
          <input
            type="number"
            min={50}
            max={1500}
            className="field"
            value={form.word_limit}
            onChange={set("word_limit")}
            placeholder={String(chosen?.word_limit ?? 350)}
          />
        </label>
      </div>

      {keyMissing && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          The backend has no {keyMissing} yet — set it in <code>.env</code> to enable voice.
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button disabled={busy} className="btn-primary w-full py-3 text-base">
        {busy ? "Setting up…" : user || loading ? "Start brainstorming with Ivy →" : "Sign up to start"}
      </button>
      <p className="text-center text-xs text-slate-500">About 10–15 minutes · Uses your microphone · You can type instead anytime</p>
    </form>
  );
}
