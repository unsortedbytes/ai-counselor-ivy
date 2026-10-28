import { IvyOrb } from "@/components/IvyOrb";
import { StartForm } from "@/components/StartForm";

const STEPS = [
  { n: "1", title: "Information capture", body: "Ivy asks you a few focused questions about your essay, by voice. Your answers are captured as you talk." },
  { n: "2", title: "Build the essay structure", body: "Ivy drafts a section-by-section structure with a word budget for each part, then refines it with you." },
  { n: "3", title: "Review, edit & download", body: "Fine-tune every section yourself, then get your essay structure report as a PDF." },
];

export default function Home() {
  return (
    <main className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:py-16">
      <section>
        <div className="flex items-center gap-3">
          <IvyOrb size={56} />
          <p className="inline-block rounded-full border border-violet-300 px-3 py-1 text-xs font-medium text-violet-600">
            AI essay brainstorming
          </p>
        </div>
        <h1 className="mt-5 text-4xl font-semibold leading-tight text-navy-900 md:text-5xl">
          Find your story.
          <br />
          <span className="bg-gradient-to-r from-ivy-600 to-teal-brand bg-clip-text text-transparent">Build your essay structure.</span>
        </h1>
        <p className="mt-5 max-w-lg text-lg text-slate-600">
          Talk your ideas through with Ivy and leave with a clear, word-budgeted plan for your college essay, built from your
          own experiences.
        </p>
        <ol className="mt-8 space-y-4">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ivy-600 to-teal-brand font-semibold text-white">
                {s.n}
              </span>
              <span>
                <span className="block font-semibold text-navy-900">{s.title}</span>
                <span className="block text-sm text-slate-600">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <StartForm />
    </main>
  );
}
