import { FlaskConical } from "lucide-react";
import { cn } from "./cn";

/** The permanent, always-visible label of the demo scenarios: fiat outcomes there are simulated. It sticks to
 * the top of the viewport and is not dismissible — that is the point of it. */
export function SandboxRibbon({ label = "Stellar Testnet · Simulated fiat outcome", className }: { label?: string; className?: string }) {
  return (
    <div
      role="note"
      className={cn("sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-dashed border-amber-600/50 bg-amber-50 px-4 py-2 text-caption font-medium text-amber-700", className)}
    >
      <FlaskConical aria-hidden className="size-4 shrink-0" />
      <span>{label}</span>
    </div>
  );
}
