import type { ReactNode } from "react";
import { Check, Clock, Minus } from "lucide-react";
import { cn } from "./cn";

export type TimelineStepState = "done" | "current" | "attention" | "upcoming" | "skipped";

export interface TimelineStep {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  time?: ReactNode;
  state: TimelineStepState;
  /** Accent of the current step. Seal only while protection is active; sapphire for everything else. */
  tone?: "sapphire" | "seal";
}

const STATE_TEXT: Record<TimelineStepState, string> = {
  done: "Completed",
  current: "In progress",
  attention: "Needs attention",
  upcoming: "Upcoming",
  skipped: "Skipped",
};

const accentBg = { sapphire: "bg-sapphire-600", seal: "bg-seal-500" } as const;
const accentBorder = { sapphire: "border-sapphire-600", seal: "border-seal-500" } as const;
const accentLine = {
  sapphire: "bg-sapphire-600",
  seal: "bg-[linear-gradient(to_bottom,var(--color-seal-500),var(--color-seal-400))]",
} as const;

function Node({ state, tone = "sapphire" }: { state: TimelineStepState; tone?: "sapphire" | "seal" }) {
  return (
    <span className="relative mt-px grid size-7 place-items-center">
      {state === "current" && <span aria-hidden className={cn("absolute inset-0 rounded-full opacity-30 motion-safe:animate-ping", accentBg[tone])} />}
      {/* keyed by state so the node re-pops whenever the step changes */}
      <span
        key={state}
        className={cn(
          "relative grid size-7 place-items-center rounded-full border-2 transition-colors duration-300",
          state === "done" && "border-foreground bg-foreground text-background motion-safe:animate-pop",
          state === "current" && cn("bg-card", accentBorder[tone]),
          state === "attention" && "border-amber-600 bg-amber-50 text-amber-700",
          state === "upcoming" && "border-input bg-card",
          state === "skipped" && "border-dashed border-input bg-card text-subtle",
        )}
      >
        {state === "done" && <Check aria-hidden className="size-4" strokeWidth={3} />}
        {state === "current" && <span className={cn("size-2.5 rounded-full", accentBg[tone])} />}
        {state === "attention" && <Clock aria-hidden className="size-3.5" strokeWidth={2.5} />}
        {state === "skipped" && <Minus aria-hidden className="size-4" />}
      </span>
    </span>
  );
}

/** The line between two nodes: a dashed track, filled solid once the step above is done, and part-filled
 * while it is in progress. The fill animates, so a step completing visibly draws the line down. */
function Connector({ from, tone = "sapphire" }: { from: TimelineStepState; tone?: "sapphire" | "seal" }) {
  const fill = from === "done" ? 1 : from === "current" || from === "attention" ? 0.4 : 0;
  return (
    <span aria-hidden className="absolute bottom-0 left-[0.8125rem] top-7 w-0.5">
      <span className="absolute inset-y-0 left-0 border-l-2 border-dashed border-input/70" />
      <span
        style={{ transform: `scaleY(${fill})` }}
        className={cn("absolute inset-0 origin-top transition-transform duration-500 ease-out-expo", from === "done" ? "bg-foreground" : accentLine[tone])}
      />
    </span>
  );
}

/** Vertical lifecycle: what has happened, what is happening, what comes next. Presentation only. */
export function Timeline({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {steps.map((step, i) => (
        <li key={step.id} aria-current={step.state === "current" ? "step" : undefined} className="relative grid grid-cols-[1.75rem_1fr] gap-x-4 pb-7 last:pb-0">
          {i < steps.length - 1 && <Connector from={step.state} tone={step.tone} />}
          <Node state={step.state} tone={step.tone} />
          <div className="min-w-0 pt-0.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className={cn("font-medium", step.state === "upcoming" || step.state === "skipped" ? "text-muted-foreground" : "text-foreground")}>
                {step.title}
                <span className="sr-only"> — {STATE_TEXT[step.state]}</span>
              </p>
              {step.time && <span className="shrink-0 font-mono text-mono text-subtle">{step.time}</span>}
            </div>
            {step.description && <p className="mt-0.5 text-caption text-muted-foreground">{step.description}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** One-line version for narrow screens: segmented progress plus the step that matters right now. */
export function TimelineCompact({ steps, className }: { steps: TimelineStep[]; className?: string }) {
  const activeIndex = steps.findIndex((s) => s.state === "current" || s.state === "attention");
  const shownIndex = activeIndex === -1 ? steps.length - 1 : activeIndex;
  const shown = steps[shownIndex];
  return (
    <div className={className}>
      <ol className="flex gap-1.5">
        {steps.map((s) => {
          const tone = s.tone ?? "sapphire";
          return (
            <li key={s.id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-strong">
              <span
                style={{ transform: `scaleX(${s.state === "done" ? 1 : s.state === "current" || s.state === "attention" ? 0.5 : 0})` }}
                className={cn("block h-full origin-left rounded-full transition-transform duration-500 ease-out-expo", s.state === "done" ? "bg-foreground" : s.state === "attention" ? "bg-amber-600" : accentBg[tone])}
              />
              <span className="sr-only">
                {s.title}: {STATE_TEXT[s.state]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 flex items-baseline justify-between gap-3 text-caption">
        <span className="font-medium text-foreground">{shown.title}</span>
        <span className="text-muted-foreground">
          Step {shownIndex + 1} of {steps.length}
        </span>
      </p>
    </div>
  );
}
