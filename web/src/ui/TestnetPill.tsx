import { cn } from "./cn";

/** Permanent honesty marker: PayoutLock runs on Stellar Testnet against a
 * sandbox anchor. Shown in the nav and app header of every redesigned route. */
export function TestnetPill({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-surface px-2.5 py-1 text-caption font-medium text-ink-600",
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-amber-600" />
      Stellar Testnet
    </span>
  );
}
