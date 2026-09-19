import type { ComponentProps, ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "./cn";
import { Skeleton } from "./Skeleton";

export function SummaryList({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("divide-y divide-border", className)} {...props} />;
}

/** A label / value row for quotes and receipts. `loading` swaps the value for a skeleton without moving anything. */
export function SummaryRow({ label, children, hint, loading, emphasis }: { label: ReactNode; children: ReactNode; hint?: ReactNode; loading?: boolean; emphasis?: "protected" }) {
  return (
    <div className="flex items-baseline justify-between gap-6 py-3.5 first:pt-0 last:pb-0">
      <dt className={cn("flex items-center gap-1.5 text-body", emphasis === "protected" ? "font-medium text-seal-700" : "text-muted-foreground")}>
        {emphasis === "protected" && <ShieldCheck aria-hidden className="size-4" />}
        {label}
      </dt>
      <dd className="text-right text-body font-medium text-foreground tabular-nums">
        {loading ? <Skeleton className="ml-auto h-5 w-24" /> : children}
        {hint && <span className="mt-0.5 block text-caption font-normal text-subtle">{hint}</span>}
      </dd>
    </div>
  );
}
