import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

// Scroll-linked motion without React re-renders: a hook writes one number, `--p` (0 to 1), onto an element, and every
// visual reads it through CSS `calc()` (see `ramp`). Nothing here runs when the person prefers reduced motion or the
// layout isn't pinned: `--p` is then 1 and the page shows every state at rest.

/** A 0-to-1 ramp of the scene's progress between two points, as a CSS expression the browser evaluates. */
export const ramp = (from: number, to: number): string => `clamp(0, calc((var(--p) - ${from}) / ${round(to - from)}), 1)`;

/** Typed custom properties for inline style: `vars({ "--chain": ramp(0, 0.2) })`. */
export const vars = (values: Record<`--${string}`, string | number>): CSSProperties => values as CSSProperties;

const round = (n: number) => Math.round(n * 1000) / 1000;

export type ScrollMode =
  /** A tall element whose first child is sticky: 0 when the child pins, 1 when it lets go. */
  | "pinned"
  /** Any element scrolling through: 0 as it enters the lower part of the screen, 1 as it leaves the upper part. */
  | "viewport";

/** Writes `--p` onto `ref`. By default progress is measured on `ref` too; `measure` measures another element instead
 * (a line inside a tall panel should draw while the line itself is on screen). Disabled, `--p` is 1: everything at rest. */
export function useScrollProgress(ref: RefObject<HTMLElement | null>, { enabled, mode, measure }: { enabled: boolean; mode: ScrollMode; measure?: RefObject<HTMLElement | null> }): void {
  // Layout effect: the first value is in place before the first paint, so nothing flashes at the wrong state.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!enabled) {
      el.style.setProperty("--p", "1");
      return;
    }
    const measured = measure?.current ?? el;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = measured.getBoundingClientRect();
      const vh = window.innerHeight;
      let p: number;
      if (mode === "pinned") {
        const sticky = measured.firstElementChild as HTMLElement | null;
        const top = sticky ? parseFloat(getComputedStyle(sticky).top) || 0 : 0;
        const range = rect.height - (sticky?.offsetHeight ?? vh);
        p = range <= 0 ? 1 : (top - rect.top) / range;
      } else {
        p = (vh * 0.85 - rect.top) / (vh * 0.3 + rect.height);
      }
      el.style.setProperty("--p", Math.min(1, Math.max(0, p)).toFixed(4));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [ref, enabled, mode, measure]);
}

/** True while the element is on screen (with a little margin). For things that should only run when seen. */
export function useInView(ref: RefObject<HTMLElement | null>, margin = "0px"): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: margin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, margin]);
  return inView;
}

/** The window's height, kept current. */
export function useViewportHeight(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerHeight,
    () => 0,
  );
}

/** An element's rendered height, kept current (0 until measured). */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeight(Math.round(entry.borderBoxSize?.[0]?.blockSize ?? el.offsetHeight)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
