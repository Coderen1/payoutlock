import { serverConfig } from "./config.ts";

export function isValidStellarAddress(v: unknown): v is string {
  return typeof v === "string" && /^G[A-Z2-7]{55}$/.test(v);
}

/** MEMO_ID must fit in an unsigned 64-bit integer, per Stellar's memo spec. */
export function isValidMemoId(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{1,20}$/.test(v)) return false;
  try {
    return BigInt(v) <= 18446744073709551615n;
  } catch {
    return false;
  }
}

export function isValidWithdrawalIdString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 128 && /^[A-Za-z0-9_.:-]+$/.test(v);
}

export function isValidDurationSeconds(v: unknown): v is number {
  return (
    typeof v === "number" &&
    Number.isInteger(v) &&
    v >= serverConfig.minDurationSeconds &&
    v <= serverConfig.maxDurationSeconds
  );
}

export function isWithinAmountCap(stroops: bigint): boolean {
  return stroops > 0n && stroops <= serverConfig.maxProtectedAmountStroops;
}

/** Precise decimal-string -> integer-stroop (7 decimals) conversion, no floats.
 * Mirrors fundingVerifier.ts's amountToStroops — kept local to avoid a cross-
 * module dependency for a two-line helper. */
export function decimalToStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(fracPadded || "0");
}
