import { cn } from "./cn";

/** Indeterminate progress. Decorative unless given a `label`, which becomes a polite status for screen readers.
 * `size` (px) sets an exact size; otherwise it is 20px, or whatever `className` says. */
export function Spinner({ className, label, size }: { className?: string; label?: string; size?: number }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden width={size} height={size} className={cn(!size && "size-5", "animate-spin", className)}>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
