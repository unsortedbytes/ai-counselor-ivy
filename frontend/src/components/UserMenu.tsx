"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (loading) return <span className="block h-8 w-24" />;
  if (!user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Link href="/login" className="rounded-lg px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100">
          Log in
        </Link>
        <Link href="/signup" className="btn-primary px-3 py-1.5 text-sm">
          Sign up
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link
        href="/dashboard"
        className="relative grid h-8 w-8 place-items-center rounded-full ring-1 ring-slate-300 hover:bg-slate-50"
        title="My essays"
        aria-label="My essays"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
      </Link>
      <div className="relative" ref={menu}>
        <button onClick={() => setOpen(!open)} className="flex items-center gap-1" aria-haspopup="menu" aria-expanded={open}>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-rose-400 to-amber-400 text-xs font-semibold text-white" title={user.email}>
            {user.name[0]?.toUpperCase()}
          </span>
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-slate-500" fill="currentColor">
            <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
          </svg>
        </button>
        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-48 rounded-xl bg-white py-1 shadow-lg ring-1 ring-slate-200">
            <p className="truncate px-3 py-2 text-xs text-slate-500">{user.email}</p>
            <Link href="/dashboard" onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50">
              My essays
            </Link>
            <Link href="/" onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-slate-50">
              New brainstorm
            </Link>
            <button onClick={logout} className="block w-full px-3 py-2 text-left text-slate-600 hover:bg-slate-50">
              Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
