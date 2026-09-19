import type { ReactNode } from "react";
import { BadgeCheck, Check, CircleDashed, Clock, Undo2 } from "lucide-react";
import { Spinner } from "../../ui/Spinner";
import { cn } from "../../ui/cn";

/** Where the bank payout stands. */
export type PayoutState = "idle" | "processing" | "arrived" | "delayed" | "missed" | "paid" | "returned";

const STATUS: Record<PayoutState, { icon: ReactNode; className: string }> = {
  idle: { icon: <CircleDashed aria-hidden className="size-3.5" />, className: "text-muted-foreground" },
  processing: { icon: <Spinner size={14} />, className: "text-sapphire-700" },
  arrived: { icon: <Check aria-hidden className="size-3.5" strokeWidth={3} />, className: "text-emerald-700" },
  delayed: { icon: <Clock aria-hidden className="size-3.5" />, className: "text-amber-700" },
  missed: { icon: <Clock aria-hidden className="size-3.5" />, className: "text-amber-700" },
  paid: { icon: <BadgeCheck aria-hidden className="size-3.5" />, className: "text-seal-700" },
  returned: { icon: <Undo2 aria-hidden className="size-3.5" />, className: "text-sapphire-700" },
};

/** Where the value is on the line: travelling (processing), waiting in the gap (late), at the bank (arrived), or back
 * at the start (claimed or returned — it comes back to the wallet). */
const DOT: Record<PayoutState, { left?: string; className: string }> = {
  idle: { left: "31%", className: "bg-seal-400 opacity-0" },
  processing: { className: "pl-travel bg-seal-400 shadow-[0_0_0_4px_rgb(34_199_184/0.18),0_0_14px_rgb(34_199_184/0.55)]" },
  arrived: { left: "calc(100% - 6px)", className: "bg-emerald-600 shadow-[0_0_0_4px_rgb(15_143_99/0.18)]" },
  delayed: { left: "70%", className: "bg-amber-600 shadow-[0_0_0_4px_rgb(183_121_31/0.18),0_0_14px_rgb(183_121_31/0.45)]" },
  missed: { left: "70%", className: "bg-amber-600 shadow-[0_0_0_4px_rgb(183_121_31/0.18)]" },
  paid: { left: "5px", className: "bg-seal-400 shadow-[0_0_0_4px_rgb(34_199_184/0.22),0_0_14px_rgb(34_199_184/0.55)]" },
  returned: { left: "5px", className: "bg-sapphire-600 shadow-[0_0_0_4px_rgb(36_81_230/0.2)]" },
};

/** The bank-payout card: the settlement line in miniature, as the product shows it. Used by the hero (processing) and
 * the product section (every state). The card itself never remounts between states, so the value visibly moves. */
export function PayoutCard({ title, status, state, start, band, end }: { title: string; status: string; state: PayoutState; start: string; band: string; end: string }) {
  const released = state === "arrived" || state === "returned";
  const dot = DOT[state];
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-float sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-body font-medium text-foreground">{title}</p>
        <span className={cn("inline-flex items-center gap-1.5 text-caption font-medium", STATUS[state].className)}>
          {STATUS[state].icon}
          {status}
        </span>
      </div>
      <div className="mt-4" aria-hidden>
        <div className="relative h-4">
          <span className="absolute left-0 top-1/2 h-0.5 w-[28%] -translate-y-1/2 bg-foreground" />
          <span
            className={cn(
              "absolute left-[28%] right-1.5 top-1/2 h-0.5 -translate-y-1/2",
              state === "arrived" ? "bg-foreground" : "bg-[repeating-linear-gradient(90deg,var(--color-amber-600)_0_5px,transparent_5px_10px)]",
            )}
          />
          <span className="absolute left-0 top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-foreground" />
          <span className="absolute left-[28%] top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground bg-card" />
          <span className={cn("absolute right-0 top-1/2 size-3 -translate-y-1/2 rounded-full border-2", state === "arrived" ? "border-emerald-600 bg-emerald-600" : "border-amber-600 bg-card")} />
          <span
            className={cn("absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,background-color,box-shadow,opacity] duration-700 ease-out-expo", dot.className)}
            style={dot.left ? { left: dot.left } : undefined}
          />
        </div>
        <div className={cn("ml-[28%] mt-1.5 h-[3px] rounded-full bg-[image:var(--gradient-seal)] transition-opacity duration-700", released && "opacity-25")} />
        <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[0.75rem] leading-tight">
          <span className="text-subtle">{start}</span>
          <span className={cn("font-medium", released ? "text-subtle" : "text-seal-700")}>{band}</span>
          <span className="text-subtle">{end}</span>
        </div>
      </div>
    </div>
  );
}
