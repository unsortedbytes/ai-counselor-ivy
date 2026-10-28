import { Suspense } from "react";
import { SessionView } from "@/components/SessionView";

export default function SessionPage({ params }: PageProps<"/session/[id]">) {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">Loading…</div>}>
      {params.then(({ id }) => (
        <SessionView id={id} />
      ))}
    </Suspense>
  );
}
