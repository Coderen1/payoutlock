import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const section = cva("relative", {
  variants: {
    tone: { canvas: "", surface: "bg-card", night: "bg-night-950 text-night-fg" },
    spacing: {
      /** Landing-page chapter rhythm. */
      chapter: "py-[clamp(96px,14vw,200px)]",
      block: "py-[clamp(64px,8vw,112px)]",
      tight: "py-12 sm:py-16",
      none: "",
    },
  },
  defaultVariants: { tone: "canvas", spacing: "block" },
});

/** A full-width band. `tone="night"` also flips the semantic color tokens for everything inside it, so cards,
 * buttons, badges and text placed in a night chapter re-theme themselves. */
export function Section({ tone, spacing, className, ...props }: ComponentProps<"section"> & VariantProps<typeof section>) {
  return <section data-tone={tone === "night" ? "night" : undefined} className={cn(section({ tone, spacing }), className)} {...props} />;
}
