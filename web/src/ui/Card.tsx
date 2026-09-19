import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const cardVariants = cva("relative rounded-card text-card-foreground", {
  variants: {
    tone: {
      default: "border border-border bg-card shadow-card",
      sunken: "border border-border bg-muted",
      /** Value is protected right now: a seal-gradient hairline and glow. Use for that meaning only. */
      // A gradient hairline without masks: the card color is painted to the padding box, the seal gradient
      // to the border box, and the 1px transparent border lets the gradient show through as the outline.
      protected: "border border-transparent shadow-glow-seal [background:linear-gradient(var(--card),var(--card))_padding-box,var(--gradient-seal)_border-box]",
    },
    padding: { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" },
  },
  defaultVariants: { tone: "default", padding: "md" },
});

export function Card({ className, tone, padding, ...props }: ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div className={cn(cardVariants({ tone, padding }), className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return <h3 className={cn("text-title text-foreground", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body text-muted-foreground", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mt-6 flex flex-wrap items-center gap-3", className)} {...props} />;
}
