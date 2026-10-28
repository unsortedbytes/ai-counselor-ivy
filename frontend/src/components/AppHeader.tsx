"use client";

import Link from "next/link";
import { useHeaderInfo } from "@/lib/header";
import { UserMenu } from "./UserMenu";

export function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-1.5" aria-label="helloivy home">
      <span className="h-5 w-5 rounded-full bg-[conic-gradient(from_200deg,#7b3dff,#2f62f0,#19c6c3,#3be0b0,#ff5a3c,#7b3dff)] p-[3px]">
        <span className="block h-full w-full rounded-full bg-white" />
      </span>
      <span className="text-lg font-semibold tracking-tight text-navy-900">
        hello<span className="text-ivy-600">ivy</span>
      </span>
    </Link>
  );
}

export function AppHeader() {
  const info = useHeaderInfo();
  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/90 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Logo />
        {info && (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span className="ml-2 hidden h-5 w-5 shrink-0 rounded-full border-2 border-ivy-300 sm:block" />
            <h1 className="shrink-0 text-base font-semibold text-navy-900 md:text-lg">{info.title}</h1>
            {info.subtitle && <p className="hidden truncate text-sm text-slate-600 md:block">{info.subtitle}</p>}
            {info.words ? (
              <span className="hidden shrink-0 rounded-full border border-violet-400 px-2.5 py-0.5 text-xs font-medium text-violet-600 sm:inline">
                {info.words} words
              </span>
            ) : null}
          </div>
        )}
        <div className="ml-auto">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
