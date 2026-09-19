import type { ComponentProps } from "react";
import { cn } from "./cn";
import { sanitizeAmount } from "./amountFormat";

interface AmountInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode"> {
  value: string;
  onValueChange: (value: string) => void;
  currency: string;
  /** Most decimal places a person may type. */
  decimals?: number;
  invalid?: boolean;
}

/** The big money field: large tabular digits, the currency beside them, and only digits and one decimal point
 * accepted. Text is display-sized (never below 16px), so iOS doesn't zoom on focus. */
export function AmountInput({ value, onValueChange, currency, decimals = 2, invalid, className, disabled, ...props }: AmountInputProps) {
  return (
    <label
      className={cn(
        "flex min-w-0 items-baseline gap-3 rounded-card border border-input bg-card px-5 py-4 transition-[border-color,box-shadow] duration-150",
        "hover:border-foreground/40 focus-within:border-ring focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--ring)_25%,transparent)]",
        invalid && "border-rose-600 focus-within:border-rose-600 focus-within:shadow-[0_0_0_3px_rgb(194_58_75/0.25)]",
        disabled && "cursor-not-allowed bg-muted",
        className,
      )}
    >
      <input
        {...props}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={props.placeholder ?? "0.00"}
        onChange={(e) => onValueChange(sanitizeAmount(e.target.value, decimals))}
        // w-0 + flex-1: an <input> has an intrinsic width of ~20 characters; at display size that would push its container wider than the screen
        className="w-0 min-w-0 flex-1 bg-transparent text-display-m tabular-nums text-foreground outline-none placeholder:text-subtle disabled:text-subtle"
      />
      <span className="text-title text-muted-foreground">{currency}</span>
    </label>
  );
}
