import { Badge } from "./Badge";
import { LIFECYCLE, type LifecycleStatus } from "./lifecycle";
import { Spinner } from "./Spinner";

/** A lifecycle status as a badge: icon (or spinner while work is in progress) + label, in the status's tone. */
export function StatusBadge({ status, size, className }: { status: LifecycleStatus; size?: "sm" | "md"; className?: string }) {
  const { label, tone, icon: Icon, busy } = LIFECYCLE[status];
  return (
    <Badge tone={tone} size={size} className={className} icon={busy ? <Spinner className="size-3.5" /> : <Icon aria-hidden className="size-3.5" />}>
      {label}
    </Badge>
  );
}
