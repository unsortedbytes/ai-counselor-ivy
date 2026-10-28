import { Suspense } from "react";
import { EssayReport } from "@/components/EssayReport";

export default function ReportPage({ params }: PageProps<"/session/[id]/report">) {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">Loading…</div>}>
      {params.then(({ id }) => (
        <EssayReport id={id} />
      ))}
    </Suspense>
  );
}
