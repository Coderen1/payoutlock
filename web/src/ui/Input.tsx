import { useId, type ComponentProps, type ReactNode } from "react";
import { CircleX } from "lucide-react";
import { cn } from "./cn";

const ringShadow = "focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_25%,transparent)]";

export function Input({ className, invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        "h-11 w-full rounded-control border border-input bg-card px-3.5 text-body text-foreground placeholder:text-subtle",
        "transition-[border-color,box-shadow,background-color] duration-150 hover:border-foreground/40",
        `focus-visible:border-ring focus-visible:outline-none ${ringShadow}`,
        "aria-invalid:border-rose-600 aria-invalid:focus-visible:shadow-[0_0_0_3px_rgb(194_58_75/0.25)]",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle read-only:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  invalid: boolean;
}

/** Label + control + hint/error, wired for assistive tech: the label is bound to the control and the
 * hint or error is announced with it. The control is rendered by the child function:
 * `<Field label="Amount">{(f) => <Input {...f} />}</Field>` */
export function Field({ label, hint, error, className, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: (control: FieldControlProps) => ReactNode }) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className={cn("grid min-w-0 grid-cols-1 gap-1.5", className)}>
      <label htmlFor={id} className="text-caption font-medium text-foreground">
        {label}
      </label>
      {children({ id, "aria-describedby": message ? messageId : undefined, invalid: Boolean(error) })}
      {message && (
        <p id={messageId} role={error ? "alert" : undefined} className={cn("flex items-start gap-1.5 text-caption", error ? "text-rose-700" : "text-muted-foreground")}>
          {error && <CircleX aria-hidden className="mt-px size-4 shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}
