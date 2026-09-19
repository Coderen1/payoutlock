import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, TriangleAlert } from "lucide-react";
import { cn } from "./cn";
import { shortenMiddle } from "./text";

/** A hash, address or reference: middle-truncated in mono, one tap to copy (with confirmation), and an optional
 * link to see it on Stellar. The full value is always available — in the tooltip, the copy and the accessible name. */
export function HashChip({ value, label = "value", href, head = 6, tail = 6, className }: { value: string; label?: string; href?: string; head?: number; tail?: number; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1800);
  };

  const iconButton =
    "relative grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground before:absolute before:-inset-1.5 before:content-['']";

  return (
    <span data-chip-actions className={cn("inline-flex h-9 max-w-full items-center gap-0.5 rounded-full border border-border bg-muted pl-3.5 pr-1", className)}>
      <code title={value} className="truncate font-mono text-mono text-foreground">
        {shortenMiddle(value, head, tail)}
      </code>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`} className={iconButton}>
        {state === "copied" ? <Check aria-hidden className="size-4 text-emerald-700" /> : state === "failed" ? <TriangleAlert aria-hidden className="size-4 text-amber-700" /> : <Copy aria-hidden className="size-4" />}
      </button>
      {href && (
        <a href={href} target="_blank" rel="noreferrer" aria-label={`View ${label} on Stellar Expert (opens in a new tab)`} className={iconButton}>
          <ExternalLink aria-hidden className="size-4" />
        </a>
      )}
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : ""}
      </span>
    </span>
  );
}
