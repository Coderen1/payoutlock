import type { ReactNode } from "react";
import { m, useReducedMotion } from "motion/react";
import { cn } from "../cn";

/** A slow seal-colored glow behind its child. It means one thing — value is protected right now — so use it
 * only there. Static (no pulsing) when the user prefers reduced motion. */
export function Breathe({ children, active = true, className }: { children: ReactNode; active?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className={cn("relative isolate", className)}>
      {active && (
        <m.span
          aria-hidden
          className="pointer-events-none absolute -inset-3 -z-10 rounded-[inherit] bg-[image:var(--gradient-seal)] blur-2xl"
          initial={{ opacity: 0.3 }}
          animate={reduce ? { opacity: 0.4 } : { opacity: [0.3, 0.6, 0.3] }}
          transition={reduce ? undefined : { duration: 4.5, ease: "easeInOut", repeat: Infinity }}
        />
      )}
      {children}
    </div>
  );
}
