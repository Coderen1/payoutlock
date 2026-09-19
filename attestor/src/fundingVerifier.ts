// Verifies a User's principal payment directly against Stellar/Horizon —
// never by trusting the Anchor's own status field (implementation plan
// Phase 3, item 4). The Anchor's reported `stellar_transaction_id` (once it
// appears) is used only as a secondary cross-check, logged for observability,
// never as the thing that actually triggers a FUNDED attestation.
import { Horizon } from "@stellar/stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const server = new Horizon.Server(HORIZON_URL);

/** Precise decimal-string -> integer-stroop (7 decimals) conversion, no floats. */
function amountToStroops(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = (frac + "0000000").slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(fracPadded || "0");
}

export interface FundingCheckParams {
  destinationAccountId: string; // anchor's account_id / withdraw_anchor_account
  expectedMemo: string; // anchor's memo (memo_type must be "id")
  expectedSenderAddress: string; // record.user
  expectedAmountStroops: bigint; // record.collateral_amount
  usdcIssuer: string;
  notBeforeUnixSeconds: number; // protection must have been opened before payment
  anchorReportedStellarTxId?: string | null; // cross-check only, never authoritative
}

export interface FundingEvidence {
  transactionHash: string;
  amountStroops: bigint;
  from: string;
  to: string;
  memo: string;
  memoType: string;
  ledgerCloseTime: string;
  crossCheckedWithAnchor: boolean;
}

/**
 * Returns funding evidence only if ALL of the following independently hold,
 * checked directly against Horizon:
 *   1. a `payment` operation exists to `destinationAccountId`
 *   2. its *effective* source (operation-level `from`, which Horizon already
 *      resolves whether or not the op overrode the tx source — we never read
 *      the tx envelope's top-level source_account for this) is
 *      `expectedSenderAddress`
 *   3. asset is exactly USDC issued by `usdcIssuer` (never asset code alone)
 *   4. amount equals `expectedAmountStroops` exactly
 *   5. the parent transaction is `successful === true`
 *   6. the parent transaction's memo is `memo_type: "id"` and equals `expectedMemo`
 *   7. the payment's ledger close time is after `notBeforeUnixSeconds`
 *      (protection must already exist before principal was sent)
 * Returns null if no matching, fully-verified payment is found yet.
 */
export async function verifyFunding(params: FundingCheckParams): Promise<FundingEvidence | null> {
  const page = await server
    .payments()
    .forAccount(params.destinationAccountId)
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

    if (p.to !== params.destinationAccountId) continue;
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

    const crossCheckedWithAnchor =
      !!params.anchorReportedStellarTxId && params.anchorReportedStellarTxId === tx.hash;
    if (params.anchorReportedStellarTxId && !crossCheckedWithAnchor) {
      console.warn(
        `[fundingVerifier] Anchor reported stellar_transaction_id=${params.anchorReportedStellarTxId} ` +
          `but independently-found Horizon tx is ${tx.hash} — not using the anchor value either way, ` +
          `just flagging the mismatch for observability.`,
      );
    }

    return {
      transactionHash: tx.hash,
      amountStroops,
      from: p.from,
      to: p.to,
      memo: tx.memo ?? "",
      memoType: tx.memo_type ?? "",
      ledgerCloseTime: p.created_at,
      crossCheckedWithAnchor,
    };
  }

  return null;
}
