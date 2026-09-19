import type { ComponentProps } from "react";
import { cn } from "./cn";

const gaps = { 1: "gap-1", 2: "gap-2", 3: "gap-3", 4: "gap-4", 5: "gap-5", 6: "gap-6", 8: "gap-8", 10: "gap-10", 12: "gap-12", 16: "gap-16" } as const;
type Gap = keyof typeof gaps;

/** Children stacked vertically with a consistent gap (4 px steps). */
export function Stack({ gap = 4, className, ...props }: ComponentProps<"div"> & { gap?: Gap }) {
  return <div className={cn("flex flex-col", gaps[gap], className)} {...props} />;
}

const justifies = { start: "justify-start", center: "justify-center", between: "justify-between", end: "justify-end" } as const;

/** Children in a row that wraps when it runs out of room. */
export function Cluster({ gap = 3, justify = "start", className, ...props }: ComponentProps<"div"> & { gap?: Gap; justify?: keyof typeof justifies }) {
  return <div className={cn("flex flex-wrap items-center", gaps[gap], justifies[justify], className)} {...props} />;
}
