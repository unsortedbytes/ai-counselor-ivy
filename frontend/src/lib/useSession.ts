"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import type { Session } from "./types";

/** Loads a session and keeps polling while the essay structure is being drafted. */
export function useSession(id: string) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const s = await api.session(id);
        if (!alive) return;
        setSession(s);
        if (s.status === "drafting") timer = setTimeout(load, 2500);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { session, setSession, error, refresh };
}
