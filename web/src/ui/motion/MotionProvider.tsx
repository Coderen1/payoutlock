import type { ReactNode } from "react";
import { LazyMotion, MotionConfig } from "motion/react";

const loadFeatures = () => import("./features").then((mod) => mod.default);

/** Wrap a page (or the gallery) once. Animation features load lazily; `strict` makes any accidental use of the
 * heavy `motion.*` components an error. `reducedMotion="user"` turns transform animation off for people who
 * asked their system for less motion — opacity changes stay. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
