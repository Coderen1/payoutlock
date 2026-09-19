import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";
import { Slot } from "radix-ui";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-medium tracking-[-0.005em]",
    "transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-out-expo",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45",
  ],
  {
    variants: {
      variant: {
        /** Ink pill (white pill on a night surface). The one primary action of a view. */
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border border-border-strong bg-card text-foreground hover:bg-surface-hover",
        ghost: "text-foreground hover:bg-surface-hover",
        /** Protection only — Claim Protection. The glow means "protected value". */
        seal: "bg-seal-500 text-white shadow-glow-seal hover:bg-sapphire-600",
      },
      size: {
        sm: "h-9 gap-1.5 px-4 text-caption",
        md: "h-11 gap-2 px-6 text-[0.9375rem]",
        lg: "h-12 gap-2 px-7 text-body",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonStatus = "idle" | "loading" | "success";

interface ButtonProps extends ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  /** Render the child element (a link, say) with the button's styling instead of a <button>. */
  asChild?: boolean;
  /** loading: spinner, click blocked. success: check mark. The label keeps its space, so the width never jumps. */
  status?: ButtonStatus;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export function Button({ className, variant, size, asChild, status = "idle", leading, trailing, children, disabled, type, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  const busy = status !== "idle";
  return (
    <button type={type ?? "button"} className={classes} disabled={disabled || status === "loading"} aria-busy={status === "loading" || undefined} {...props}>
      <span className={cn("inline-flex items-center justify-center gap-[inherit]", busy && "invisible")}>
        {leading}
        {children}
        {trailing}
      </span>
      {busy && (
        <span aria-hidden className="absolute inset-0 grid place-items-center">
          {status === "loading" ? <Spinner /> : <Check className="size-5 animate-pop" strokeWidth={2.5} />}
        </span>
      )}
    </button>
  );
}
