import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../ui/cn";
import "./landing.css";

export interface LineText {
  title: string;
  detail?: string;
}

interface SettlementLineProps {
  /** Horizontal from tablet up; vertical on phones (the scenes) — the parent decides. */
  orientation: "horizontal" | "vertical";
  size?: "hero" | "scene" | "compact";
  start: LineText;
  end: LineText;
  /** Text over the gap; omit to leave the gap unlabeled. */
  gap?: string;
  /** Text under the protection band. */
  band?: string;
  /** What a screen reader should hear instead of the drawing. */
  description: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** The settlement line: the payment settles on-chain in seconds (solid), the bank payout is off-chain and takes as
 * long as it takes (dashed, "the gap"), and PayoutLock's protection is a band under the gap. Purely presentational;
 * see landing.css for how it is animated. */
export function SettlementLine({ orientation, size = "hero", start, end, gap, band, description, className, style, children }: SettlementLineProps) {
  const vertical = orientation === "vertical";
  return (
    <div
      role="img"
      aria-label={description}
      className={cn("pl-line group", className)}
      data-orient={vertical ? "v" : "h"}
      data-size={size}
      style={style}
    >
      <span data-part="gap" aria-hidden />
      <span data-part="ticks" aria-hidden />
      <span data-part="chain" aria-hidden />
      <span data-part="bracket" aria-hidden />
      <span data-part="band" aria-hidden />
      <span data-part="node" data-node="start" aria-hidden />
      <span data-part="node" data-node="mid" aria-hidden />
      <span data-part="node" data-node="end" aria-hidden />
      <span data-part="dot" aria-hidden />

      <span data-part="label" data-label="start" className="whitespace-nowrap">
        <span className="block text-caption font-medium text-foreground">{start.title}</span>
        {start.detail && <span className="mt-0.5 block font-mono group-data-[orient=h]:max-sm:hidden text-mono uppercase tracking-[0.08em] text-subtle">{start.detail}</span>}
      </span>
      <span data-part="label" data-label="end" className="whitespace-nowrap">
        <span className="block text-caption font-medium text-foreground">{end.title}</span>
        {end.detail && <span className="mt-0.5 block font-mono group-data-[orient=h]:max-sm:hidden text-mono uppercase tracking-[0.08em] text-subtle">{end.detail}</span>}
      </span>
      {gap && (
        <span data-part="label" data-label="gap" className="whitespace-nowrap font-mono text-mono uppercase tracking-[0.08em] [color:var(--pl-gap-ink)]">
          {gap}
        </span>
      )}
      {band && (
        <span data-part="label" data-label="band" className="whitespace-nowrap text-caption font-medium [color:var(--pl-seal-ink)]">
          {band}
        </span>
      )}
      {children}
    </div>
  );
}
