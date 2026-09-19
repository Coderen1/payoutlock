import type { ReactNode } from "react";
import { m } from "motion/react";
import { duration, ease } from "./tokens";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease } } };

/** Children enter one after another (60 ms apart) when the group scrolls into view. Wrap each child in StaggerItem. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div variants={container} initial="hidden" whileInView="show" viewport={{ once: true, margin: "0px 0px -10% 0px" }} className={className}>
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div variants={item} className={className}>
      {children}
    </m.div>
  );
}
