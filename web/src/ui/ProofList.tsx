import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "./cn";
import { HashChip } from "./HashChip";
import { Skeleton } from "./Skeleton";

export interface ProofItem {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** Absent while the proof does not exist yet. */
  hash?: string;
  href?: string;
  time?: ReactNode;
}

/** Verifiable receipts: each step that left a public record, with the record one tap away.
 * A step with no hash yet is shown as waiting — never with a made-up value. */
export function ProofList({ items, className }: { items: ProofItem[]; className?: string }) {
  return (
    <ul className={cn("divide-y divide-border", className)}>
      {items.map((item) => (
        <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", item.hash ? "bg-emerald-50 text-emerald-700" : "border border-dashed border-input text-transparent")}
            >
              <Check className="size-3.5" strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className={cn("font-medium", item.hash ? "text-foreground" : "text-muted-foreground")}>{item.label}</p>
              {(item.description || item.time) && (
                <p className="text-caption text-muted-foreground">
                  {item.description}
                  {item.description && item.time ? " · " : ""}
                  {item.time}
                </p>
              )}
            </div>
          </div>
          {item.hash ? <HashChip value={item.hash} href={item.href} label={typeof item.label === "string" ? item.label : "hash"} /> : <Skeleton className="h-9 w-40 rounded-full" />}
        </li>
      ))}
    </ul>
  );
}
