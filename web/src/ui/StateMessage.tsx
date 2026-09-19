import type { ReactNode } from "react";
import { cn } from "./cn";
import { StatusMark, type StatusMarkState } from "./StatusMark";

/** A whole-panel state — loading, done, failed, protected — with its mark, a title, an explanation and an
 * optional action. Errors are announced immediately; everything else politely. */
export function StateMessage({ state, title, description, action, className }: { state: StatusMarkState; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={state === "error" ? "alert" : "status"} className={cn("grid justify-items-center gap-4 text-center", className)}>
      <StatusMark state={state} />
      <div className="grid max-w-[36ch] gap-1.5">
        <h3 className="text-title text-foreground">{title}</h3>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
