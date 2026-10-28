"use client";

import { createContext, useContext, useEffect, useState } from "react";

/** What the session pages show in the app header, e.g. "Bryn Mawr, Essay 1: Learning to let go · 250 words". */
export type HeaderInfo = { title: string; subtitle?: string; words?: number } | null;

const Ctx = createContext<{ info: HeaderInfo; setInfo: (h: HeaderInfo) => void }>({ info: null, setInfo: () => {} });

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<HeaderInfo>(null);
  return <Ctx.Provider value={{ info, setInfo }}>{children}</Ctx.Provider>;
}

export const useHeaderInfo = () => useContext(Ctx).info;

/** Show `info` in the header while the calling page is mounted. */
export function useHeader(info: HeaderInfo) {
  const { setInfo } = useContext(Ctx);
  const key = JSON.stringify(info);
  useEffect(() => {
    setInfo(key === "null" ? null : JSON.parse(key));
    return () => setInfo(null);
  }, [key, setInfo]);
}
