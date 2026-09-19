import type { ReactNode } from "react";
import { cva } from "class-variance-authority";
import { CircleCheck, CircleX, FlaskConical, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { cn } from "./cn";

type NoticeTone = "info" | "neutral" | "success" | "warning" | "error" | "simulated";

const notice = cva("flex items-start gap-3 rounded-card border p-4", {
  variants: {
    tone: {
      info: "border-sapphire-600/20 bg-sapphire-50 text-sapphire-700",
      neutral: "border-border bg-muted text-muted-foreground",
      success: "border-emerald-600/25 bg-emerald-50 text-emerald-700",
      warning: "border-amber-600/30 bg-amber-50 text-amber-700",
      /** System errors only. A protection outcome (a claim, a refund) is never an error. */
      error: "border-rose-600/25 bg-rose-50 text-rose-700",
      simulated: "border-dashed border-amber-600/50 bg-amber-50 text-amber-700",
    } satisfies Record<NoticeTone, string>,
  },
  defaultVariants: { tone: "info" },
});

const ICONS: Record<NoticeTone, LucideIcon> = { info: Info, neutral: Info, success: CircleCheck, warning: TriangleAlert, error: CircleX, simulated: FlaskConical };

interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  /** A button or link on the right. */
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** An inline message. Errors are announced immediately (role=alert); everything else politely. */
export function Notice({ tone = "info", title, children, action, onDismiss, className }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn(notice({ tone }), className)}>
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 text-body">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-foreground", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-m-2.5 grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-black/5">
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}
