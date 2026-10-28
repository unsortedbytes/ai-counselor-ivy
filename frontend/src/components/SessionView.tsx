"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useHeader } from "@/lib/header";
import { headerFor } from "@/lib/types";
import { useSession } from "@/lib/useSession";
import { CaptureRoom } from "./CaptureRoom";
import { IvyOrb } from "./IvyOrb";
import { StructureRoom } from "./StructureRoom";

/** /session/[id]: shows whichever stage the brainstorm is in. */
export function SessionView({ id }: { id: string }) {
  const router = useRouter();
  const { session, error, refresh } = useSession(id);
  const [retrying, setRetrying] = useState(false);
  useHeader(headerFor(session));

  useEffect(() => {
    if (session?.status === "completed") router.replace(`/session/${id}/report`);
  }, [id, router, session?.status]);

  if (!session) return <p className="p-10 text-center text-slate-500">{error || "Loading your session…"}</p>;

  switch (session.status) {
    case "created":
    case "capturing":
      return <CaptureRoom session={session} onFinalized={refresh} />;
    case "structuring":
      return <StructureRoom session={session} />;
    case "drafting":
      return (
        <Waiting title="Ivy is drafting your essay structure…">
          She&apos;s turning your answers into a section-by-section plan with a word budget for each part. This usually
          takes under a minute.
        </Waiting>
      );
    case "failed":
      return (
        <Waiting title="We couldn't build your structure" still>
          <span className="block text-red-600">{session.error}</span>
          <button
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              await api.finalize(id).catch(() => {});
              setRetrying(false);
              refresh();
            }}
            className="btn-primary mt-5"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </Waiting>
      );
    default:
      return <p className="p-10 text-center text-slate-500">Opening your report…</p>;
  }
}

function Waiting({ title, children, still }: { title: string; children: React.ReactNode; still?: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <IvyOrb size={160} animated={!still} />
      <h2 className="mt-6 text-xl font-semibold text-navy-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{children}</p>
    </main>
  );
}
