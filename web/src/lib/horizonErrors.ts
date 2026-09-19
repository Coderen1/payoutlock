// Translates real Horizon `result_codes` into messages meant to be shown
// directly to a User — never the raw
// "Transaction submission failed. Server responded: 400 Bad Request" dump
// the SDK's TransactionFailedError.message produces by default.
const OPERATION_ERROR_MESSAGES: Record<string, string> = {
  op_underfunded: "Insufficient USDC balance to complete this payment.",
  op_src_no_trust: "Your wallet does not have a USDC trustline yet.",
  op_no_trust: "Destination cannot receive this USDC asset (no trustline).",
  op_no_destination: "Destination account not found on Testnet.",
  op_line_full: "Destination's USDC balance limit would be exceeded by this payment.",
  op_low_reserve: "Your account does not meet the minimum XLM reserve required for this operation.",
  op_bad_auth: "Transaction signature was not accepted by the network.",
  op_not_authorized: "This account is not authorized to hold USDC.",
};

const TRANSACTION_ERROR_MESSAGES: Record<string, string> = {
  tx_insufficient_balance: "Insufficient XLM balance to pay the network fee.",
  tx_bad_seq: "Transaction sequence number was stale — please try again.",
  tx_too_late: "Transaction expired before it was submitted — please try again.",
};

export function friendlyHorizonError(e: unknown): string {
  const anyE = e as any;
  const opCodes: string[] | undefined = anyE?.response?.data?.extras?.result_codes?.operations;
  const txCode: string | undefined = anyE?.response?.data?.extras?.result_codes?.transaction;

  if (opCodes?.length) {
    const known = opCodes.map((c) => OPERATION_ERROR_MESSAGES[c]).find(Boolean);
    if (known) return known;
    return `Payment failed on-chain (${opCodes.join(", ")}).`;
  }
  if (txCode) {
    return TRANSACTION_ERROR_MESSAGES[txCode] ?? `Payment failed on-chain (${txCode}).`;
  }
  return e instanceof Error ? e.message : "Payment failed for an unknown reason.";
}
