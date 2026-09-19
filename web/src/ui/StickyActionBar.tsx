import type { ReactNode } from "react";
import { cn } from "./cn";

/** The primary action, pinned to the bottom of the screen on phones (with the home-indicator safe area and a
 * restrained glass background) and simply inline from `md` up. `inline` forces the inline form. */
export function StickyActionBar({ children, inline, reserveSpace = true, className }: { children: ReactNode; inline?: boolean; /** Leave room under the content so the bar never covers the last of it. Turn off when the page reserves it once itself. */ reserveSpace?: boolean; className?: string }) {
  if (inline) return <div className={className}>{children}</div>;
  return (
    <>
      {reserveSpace && <div aria-hidden className="h-24 md:hidden" />}
      <div
        data-sticky-bar
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/80 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl",
          "md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}
