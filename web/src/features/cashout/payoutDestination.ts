/**
 * The bank account a cash out would land in, for the summary rows in Compose and Tracking.
 *
 * Presentation only, and deliberately honest about it: the sandbox anchor asks for **no** bank
 * fields at all — its `/sep6/info` reports `withdraw.USDC.types.bank_account.fields` as empty, and
 * the SEP-6 withdrawal request sends only the asset, the funding method and the amount. No IBAN is
 * ever collected, validated, stored, transmitted or paid to anywhere in this prototype.
 *
 * So this row exists to answer "where does my money actually go?" for someone reading the screen —
 * and it always says, on the same row, that it is an example rather than their account. Nothing
 * here is read by the backend or the contract.
 */
import type { FlowMode } from "./scenario.ts";

/**
 * A masked Turkish IBAN. Only the mask is ever rendered: there is no unmasked value behind it to
 * reveal, because no account number exists anywhere in the system.
 */
export const PAYOUT_DESTINATION_MASK = "TR•• •••• •••• •••• •••• 1234";

export interface PayoutDestination {
  label: string;
  value: string;
  /** Sits under the value. Never implies the anchor validates or pays to this account. */
  hint: string;
}

export function payoutDestination(mode: FlowMode): PayoutDestination {
  return mode === "demo"
    ? { label: "Simulated bank destination", value: PAYOUT_DESTINATION_MASK, hint: "Example only · not a real bank account" }
    : { label: "Payout destination", value: PAYOUT_DESTINATION_MASK, hint: "Example only · this prototype doesn't collect your bank details" };
}
