import type { ReactNode } from "react";
import { m } from "motion/react";
import { cn } from "../cn";
import { duration, ease } from "./tokens";

/** Fades and rises into place once, when scrolled into view. */
export function Reveal({ children, delay = 0, y = 16, className }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <m.div
      className={cn(className)}
      initial={{ opacity: 0, y, filter: "blur(4px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ duration: duration.chapter, ease, delay }}
    >
      {children}
    </m.div>
  );
}
