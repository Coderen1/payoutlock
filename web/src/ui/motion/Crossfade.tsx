import type { ReactNode } from "react";
import { AnimatePresence, m } from "motion/react";
import { duration, ease } from "./tokens";

/** Swaps its content when `id` changes: the old content fades out, the new content fades in — for a product
 * frame or a status changing in place. */
export function Crossfade({ id, children, className }: { id: string | number; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={id}
        className={className}
        initial={{ opacity: 0, y: 8, filter: "blur(3px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(3px)" }}
        transition={{ duration: duration.base, ease }}
      >
        {children}
      </m.div>
    </AnimatePresence>
  );
}
