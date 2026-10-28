import { Suspense } from "react";
import { StructureEditor } from "@/components/StructureEditor";

export default function ReviewPage({ params }: PageProps<"/session/[id]/review">) {
  return (
    <Suspense fallback={<div className="p-10 text-center text-slate-500">Loading…</div>}>
      {params.then(({ id }) => (
        <StructureEditor id={id} />
      ))}
    </Suspense>
  );
}
