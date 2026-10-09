// The three steps of adding an application: save the link (from the phone's
// share menu or the inbox), fetch the posting's details, write the cover letter.

const STEPS = ["Save link", "Fetch details", "Cover letter"] as const;

export default function FlowSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const state = step < current ? "done" : step === current ? "current" : "upcoming";
        return (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span className="h-px w-6 bg-neutral-300" />}
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                state === "upcoming"
                  ? "border border-neutral-300 text-neutral-400"
                  : "bg-neutral-900 text-white"
              }`}
            >
              {state === "done" ? "✓" : step}
            </span>
            <span className={state === "current" ? "font-medium" : "text-neutral-500"}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
