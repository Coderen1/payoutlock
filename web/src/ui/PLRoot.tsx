import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { cn } from "./cn";

/** Root of every redesigned route. The `data-pl` attribute is what scopes the
 * design system's base styles (styles/base.css) — nothing outside it is touched.
 * Fonts are imported here so they ship with the redesigned routes only. */
export function PLRoot({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div data-pl className={cn(className)}>
      {children}
    </div>
  );
}
