import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../ui/cn";

/** Fades and rises into place once, when scrolled into view — the landing page's CSS-only version of ui/motion's
 * Reveal, so the public page doesn't download an animation engine for one effect. People who ask for less motion get
 * the content in place from the start (landing.css). */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || shown) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown]);
  return (
    <div ref={ref} data-reveal={shown ? "shown" : "hidden"} className={cn(className)} style={delay ? { transitionDelay: `${delay}s` } : undefined}>
      {children}
    </div>
  );
}
