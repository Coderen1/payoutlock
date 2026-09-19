import { decimalToStroops } from "../../lib/format.ts";

/** The sandbox anchor refuses withdrawals under 1 USDC (its /sep6/info advertises 0.5, but the withdraw
 * endpoint enforces 1). The demo scenarios that never touch the anchor can go lower. */
export const MIN_ANCHOR_WITHDRAWAL = "1";
export const MIN_DEMO_SIMULATED = "0.1";

const trim = (decimal: string) => decimal.replace(/\.?0+$/, "");

/** A capacity as a person reads it: cents, rounded DOWN. People type at most two decimals, so an amount is within
 * capacity exactly when it is within the rounded-down figure — the number never promises more than there is. */
export function formatCapacity(stroops: bigint): string {
  const cents = stroops / 100_000n;
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** Human-readable error for an amount, or null when it is fine. `maxStroops` is the most that can be protected right
 * now — the product cap or the provider's available liquidity, whichever is lower (see `effectiveMax`). */
export function validateAmount(input: string, opts: { min: string; maxStroops: bigint | null }): string | null {
  if (input.trim() === "" || input === ".") return "Enter an amount.";
  let value: bigint;
  try {
    value = decimalToStroops(input);
  } catch {
    return "Enter a valid amount.";
  }
  if (value <= 0n) return "Enter an amount greater than zero.";
  const capacity = opts.maxStroops;
  const overCapacity = `Protection capacity is currently ${capacity === null ? "" : formatCapacity(capacity)} USDC.`;
  // When even the minimum can't be covered, say so first — "the minimum is 1" would only send people into a dead end.
  if (capacity !== null && capacity < decimalToStroops(opts.min)) return overCapacity;
  if (value < decimalToStroops(opts.min)) return `The minimum is ${trim(opts.min)} USDC.`;
  if (capacity !== null && value > capacity) return overCapacity;
  return null;
}
