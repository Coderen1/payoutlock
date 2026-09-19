// Verifies the Demo Refund Account's principal-return payment directly
// against Stellar/Horizon before the attestor is allowed to sign REFUNDED —
// same independent-verification discipline as fundingVerifier.ts (never
// trust a self-reported "I sent it", always find and check the real tx).
// Phase 4 / plan Bölüm 12: "REFUNDED attestation ancak bu gerçek işlem
// doğrulandıktan sonra imzalanmalı."
import { Horizon } from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const server = new Horizon.Server(HORIZON_URL);

function amountToStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(fracPadded || "0");
}

export interface RefundCheckParams {
  expectedSenderAddress: string; // configured Demo Refund Account
  expectedRecipientAddress: string; // record.user
  expectedAmountStroops: bigint; // record.collateral_amount (protected amount)
  usdcIssuer: string;
  expectedMemo: string; // demo/reference memo correlating this refund to the protection
  notBeforeUnixSeconds: number; // must be after funded_at
}

export interface RefundEvidence {
  transactionHash: string;
  amountStroops: bigint;
  from: string;
  to: string;
  memo: string;
  memoType: string;
  ledgerCloseTime: string;
}

/**
 * Returns refund evidence only if ALL of the following independently hold,
 * checked directly against Horizon:
 *   1. a `payment` operation exists to `expectedRecipientAddress`
 *   2. its operation-level effective source is `expectedSenderAddress`
 *      (the configured Demo Refund Account — never trusted by name alone)
 *   3. asset is exactly USDC issued by `usdcIssuer`
 *   4. amount equals `expectedAmountStroops` exactly (the protected amount)
 *   5. the parent transaction is `successful === true`
 *   6. the parent transaction's memo is `memo_type: "id"` and equals
 *      `expectedMemo` (correlates this refund to the specific protection)
 *   7. the payment's ledger close time is after `notBeforeUnixSeconds`
 *      (must come after the protection was actually FUNDED)
 * Returns null if no matching, fully-verified payment is found yet.
 */
export async function verifyRefund(params: RefundCheckParams): Promise<RefundEvidence | null> {
  const page = await server
    .payments()
    .forAccount(params.expectedRecipientAddress)
    .order("desc")
    .limit(50)
    .call();

  for (const record of page.records) {
    if (record.type !== "payment") continue;
    const p = record as unknown as {
      to: string;
      from: string;
      asset_type: string;
      asset_code?: string;
      asset_issuer?: string;
      amount: string;
      transaction_hash: string;
      created_at: string;
      transaction: () => Promise<Horizon.ServerApi.TransactionRecord>;
    };

    if (p.to !== params.expectedRecipientAddress) continue;
    if (p.from !== params.expectedSenderAddress) continue; // operation-level effective source
    if (p.asset_type === "native") continue;
    if (p.asset_code !== "USDC" || p.asset_issuer !== params.usdcIssuer) continue;

    const amountStroops = amountToStroops(p.amount);
    if (amountStroops !== params.expectedAmountStroops) continue;

    const closeTimeMs = new Date(p.created_at).getTime();
    if (closeTimeMs / 1000 <= params.notBeforeUnixSeconds) continue;

    const tx = await p.transaction();
    if (!tx.successful) continue;
    if (tx.memo_type !== "id") continue;
    if (tx.memo !== params.expectedMemo) continue;

    return {
      transactionHash: tx.hash,
      amountStroops,
      from: p.from,
      to: p.to,
      memo: tx.memo ?? "",
      memoType: tx.memo_type ?? "",
      ledgerCloseTime: p.created_at,
    };
  }

  return null;
}
