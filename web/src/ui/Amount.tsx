import { cn } from "./cn";
import { formatAmountParts } from "./amountFormat";

const sizes = {
  display: "text-display-l",
  xl: "text-display-m",
  lg: "text-title",
  md: "text-lead font-semibold",
  sm: "text-body font-medium",
} as const;

interface AmountProps {
  /** A decimal string ("1234.5"). Strings, not numbers, so nothing is ever rounded on the way in. */
  value: string;
  /** Fraction digits shown at minimum (padded with zeros, never truncated). */
  decimals?: number;
  currency?: string;
  size?: keyof typeof sizes;
  /** An estimate, not a promise — prefixes "≈". */
  approx?: boolean;
  className?: string;
}

/** Money for display: tabular figures, the fraction dimmed, the currency small beside it. */
export function Amount({ value, decimals = 2, currency, size = "lg", approx, className }: AmountProps) {
  const { sign, whole, frac } = formatAmountParts(value, decimals);
  const spoken = `${approx ? "approximately " : ""}${sign ? "minus " : ""}${whole.replace(/,/g, "")}${frac ? `.${frac}` : ""}${currency ? ` ${currency}` : ""}`;
  return (
    <span className={cn("inline-flex items-baseline tabular-nums", sizes[size], className)}>
      <span className="sr-only">{spoken}</span>
      <span aria-hidden className="inline-flex items-baseline">
        {approx && <span className="mr-[0.25em] text-muted-foreground">≈</span>}
        <span>
          {sign}
          {whole}
        </span>
        {frac && <span className="text-muted-foreground">.{frac}</span>}
        {currency && <span className="ml-[0.4em] text-[0.5em] font-medium tracking-normal text-subtle">{currency}</span>}
      </span>
    </span>
  );
}
