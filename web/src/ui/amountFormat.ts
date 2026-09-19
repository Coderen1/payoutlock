/** Pure string handling for money — no floats, so nothing is ever silently rounded. */

export interface AmountParts {
  sign: "" | "−";
  whole: string; // thousands-grouped
  frac: string; // at least `decimals` digits, never truncated
}

/** Splits a decimal string for display. Pads the fraction up to `decimals` but never cuts digits off,
 * so 1.2345678 stays 1.2345678 and 1 becomes 1.00. */
export function formatAmountParts(value: string, decimals = 2): AmountParts {
  const negative = value.trim().startsWith("-");
  const [w = "", f = ""] = value.replace(/[^\d.]/g, "").split(".");
  const whole = (w.replace(/^0+(?=\d)/, "") || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return { sign: negative ? "−" : "", whole, frac: f.padEnd(decimals, "0") };
}

/** Keeps what a person can type into an amount field: digits and one decimal point, at most `decimals`
 * places, no leading zeros, "," accepted as the decimal point. */
export function sanitizeAmount(raw: string, decimals: number): string {
  const [whole = "", ...rest] = raw.replace(",", ".").replace(/[^\d.]/g, "").split(".");
  let out = whole.replace(/^0+(?=\d)/, "");
  if (rest.length > 0) out += `.${rest.join("").slice(0, decimals)}`;
  return out.startsWith(".") ? `0${out}` : out;
}
