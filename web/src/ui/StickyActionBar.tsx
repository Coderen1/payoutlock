import type { ReactNode } from "react";
import { cn } from "./cn";

/** The primary action, pinned to the bottom of the screen on phones (with the home-indicator safe area and a
 * restrained glass background) and simply inline from `md` up. `inline` forces the inline form. */
export function StickyActionBar({ children, inline, className }: { children: ReactNode; inline?: boolean; className?: string }) {
  if (inline) return <div className={className}>{children}</div>;
  return (
    <>
      <div aria-hidden className="h-24 md:hidden" /> {/* keeps the last content clear of the bar */}
      <div
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
