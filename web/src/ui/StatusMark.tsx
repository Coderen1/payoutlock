import { ShieldCheck } from "lucide-react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type StatusMarkState = "loading" | "success" | "error" | "protected";

/** The large mark of a moment: working, done, failed, or protected. Success and error draw themselves in;
 * with reduced motion they simply appear. Decorative — the title next to it carries the meaning. */
export function StatusMark({ state, size = 56, className }: { state: StatusMarkState; size?: number; className?: string }) {
  if (state === "loading") {
    return (
      <span aria-hidden style={{ width: size, height: size }} className={cn("grid place-items-center rounded-full bg-sapphire-50 text-sapphire-600", className)}>
        <Spinner size={Math.round(size * 0.5)} />
      </span>
    );
  }
  if (state === "protected") {
    return (
      <span aria-hidden style={{ width: size, height: size }} className={cn("grid place-items-center rounded-full bg-seal-50 text-seal-700 shadow-glow-seal", className)}>
        <ShieldCheck className="size-1/2" strokeWidth={2} />
      </span>
    );
  }
  const success = state === "success";
  return (
    <svg aria-hidden viewBox="0 0 56 56" width={size} height={size} fill="none" className={className}>
      <circle cx="28" cy="28" r="27" className={success ? "fill-emerald-50" : "fill-rose-50"} />
      <circle
        cx="28"
        cy="28"
        r="26"
        pathLength={1}
        strokeDasharray={1}
        strokeWidth="2.5"
        strokeLinecap="round"
        className={cn("animate-draw", success ? "stroke-emerald-600" : "stroke-rose-600")}
      />
      <path
        d={success ? "M18 29.5l7.5 7.5L39 21" : "M20 20l16 16M36 20L20 36"}
        pathLength={1}
        strokeDasharray={1}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ animationDelay: "0.3s" }}
        className={cn("animate-draw", success ? "stroke-emerald-700" : "stroke-rose-700")}
      />
    </svg>
  );
}
