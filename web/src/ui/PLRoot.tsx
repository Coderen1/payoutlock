import { useState, type ReactNode } from "react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { cn } from "./cn";
import { PortalContainerContext } from "./portal";

/** Root of every redesigned route. The `data-pl` attribute is what scopes the design system's base styles
 * (styles/base.css) — nothing outside it is touched. Fonts are imported here so they ship with the redesigned
 * routes only. Menus and tooltips portal into this element rather than <body>, so they get the same styles. */
export function PLRoot({ className, children }: { className?: string; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return (
    <div data-pl ref={setRoot} className={cn(className)}>
      <PortalContainerContext value={root}>{children}</PortalContainerContext>
    </div>
  );
}
