import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

// Width = the smaller of (the viewport minus the side gutters) and the cap, so gutters are 20 / 32 / 48 px
// and nothing ever forces horizontal scroll.
const container = cva("mx-auto", {
  variants: {
    size: {
      /** Marketing content, 1200. */
      content: "w-[min(100%_-_2.5rem,1200px)] sm:w-[min(100%_-_4rem,1200px)] lg:w-[min(100%_-_6rem,1200px)]",
      /** Reading width, 720. */
      narrow: "w-[min(100%_-_2.5rem,720px)] sm:w-[min(100%_-_4rem,720px)] lg:w-[min(100%_-_6rem,720px)]",
      /** The product's single-column card, 520. */
      app: "w-[min(100%_-_2.5rem,520px)]",
    },
  },
  defaultVariants: { size: "content" },
});

export function Container({ size, className, ...props }: ComponentProps<"div"> & VariantProps<typeof container>) {
  return <div className={cn(container({ size }), className)} {...props} />;
}
