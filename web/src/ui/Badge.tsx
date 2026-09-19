import type { ComponentProps, ReactNode } from "react";
import { cva } from "class-variance-authority";
import { cn } from "./cn";
import type { Tone } from "./tones";

const badgeVariants = cva("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium", {
  variants: {
    tone: {
      neutral: "bg-muted text-muted-foreground",
      sapphire: "bg-sapphire-50 text-sapphire-700",
      seal: "bg-seal-50 text-seal-700",
      emerald: "bg-emerald-50 text-emerald-700",
      amber: "bg-amber-50 text-amber-700",
      rose: "bg-rose-50 text-rose-700",
    } satisfies Record<Tone, string>,
    size: { sm: "h-6 px-2.5 text-[0.75rem]", md: "h-7 px-3 text-caption" },
  },
  defaultVariants: { tone: "neutral", size: "md" },
});

export function Badge({ tone, size, icon, className, children, ...props }: Omit<ComponentProps<"span">, "children"> & { tone?: Tone; size?: "sm" | "md"; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props}>
      {icon}
      {children}
    </span>
  );
}
