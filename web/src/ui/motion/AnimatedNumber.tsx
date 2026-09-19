import { useEffect } from "react";
import { animate, m, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { cn } from "../cn";
import { duration, ease } from "./tokens";

/** Eases between numbers when a value changes (a quote refreshing, say), so a change is seen rather than
 * snapped. Display only — it goes through floating point, so render authoritative amounts with <Amount>. */
export function AnimatedNumber({ value, decimals = 2, className }: { value: number; decimals?: number; className?: string }) {
  const reduce = useReducedMotion();
  const motionValue = useMotionValue(value);
  const text = useTransform(motionValue, (v) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));

  useEffect(() => {
    if (reduce) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration: duration.chapter, ease });
    return () => controls.stop();
  }, [value, reduce, motionValue]);

  return <m.span className={cn("tabular-nums", className)}>{text}</m.span>;
}
