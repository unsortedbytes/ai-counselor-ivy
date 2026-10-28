"use client";

import { useEffect, useRef, useState } from "react";
import { api, type User } from "@/lib/api";

// Minimal typing for Google Identity Services (https://accounts.google.com/gsi/client).
type Gsi = {
  accounts: {
    id: {
      initialize(opts: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
      renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
    };
  };
};
declare global {
  interface Window {
    google?: Gsi;
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsi(): Promise<Gsi> {
  if (window.google?.accounts) return Promise.resolve(window.google);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = GSI_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => resolve(window.google!));
    script.addEventListener("error", () => reject(new Error("Couldn't load Google sign-in")));
  });
}

/** "Continue with Google". Renders nothing unless the backend has a client ID. */
export function GoogleButton({ onSignedIn, label }: { onSignedIn: (u: User) => void; label: "signin_with" | "signup_with" }) {
  const box = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .authConfig()
      .then((c) => setClientId(c.google_client_id))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsi()
      .then((gsi) => {
        if (cancelled || !box.current) return;
        gsi.accounts.id.initialize({
          client_id: clientId,
          // Google hands us a signed ID token; the backend verifies it.
          callback: async ({ credential }) => {
            setError("");
            try {
              onSignedIn(await api.google(credential));
            } catch (e) {
              setError((e as Error).message);
            }
          },
        });
        gsi.accounts.id.renderButton(box.current, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: label,
          width: box.current.offsetWidth || 320,
        });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, label, onSignedIn]);

  if (!clientId) return null;
  return (
    <div>
      <div ref={box} className="flex min-h-[44px] w-full justify-center" />
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or
        <span className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}
