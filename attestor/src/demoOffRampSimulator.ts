// SIMULATED off-ramp / refund-source module — Phase 4 (demo failure + refund
// scenarios) ONLY.
//
// Real TR Mock Anchor cannot natively produce either outcome this module
// stands in for: "USDC received but fiat payout failed" (confirmed
// limitation, Architecture §11) or a principal-refund transaction. This
// module exists solely to provide the two missing REAL on-chain building
// blocks for demo purposes:
//   - a destination account to receive the User's real principal payment
//     (standing in for the real anchor's withdraw `account_id`)
//   - a source account that sends a real refund payment back to the User
//     (standing in for a real anchor-side principal return)
//
// It never talks to the real anchor, never submits a contract transaction,
// and never signs an attestation itself — `sign.ts` still owns that, and
// only after independent on-chain verification (Bölüm 6/10 discipline
// applies here unchanged). Every function refuses to run unless
// DEMO_MODE=true, and there is no HTTP endpoint anywhere in this file — it
// is only ever called directly by a demo orchestration script.
import { randomBytes } from "node:crypto";
import { Keypair, TransactionBuilder, Networks, Operation, Asset, Memo, Horizon } from "@stellar/stellar-sdk";
import { config } from "./config.ts";

const HORIZON = new Horizon.Server("https://horizon-testnet.stellar.org");
const USDC = new Asset("USDC", config.usdcIssuer);

function requireDemoMode(): void {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error(
      "[SIMULATED] demoOffRampSimulator refused to run: DEMO_MODE is not 'true'. " +
        "This module must never be reachable outside an explicit demo run.",
    );
  }
}

function requiredDemoSecret(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[SIMULATED] Missing required demo-only env var: ${name}`);
  return v;
}

export function demoOffRampKeypair(): Keypair {
  requireDemoMode();
  return Keypair.fromSecret(requiredDemoSecret("DEMO_OFFRAMP_SECRET"));
}

export function demoRefundKeypair(): Keypair {
  requireDemoMode();
  return Keypair.fromSecret(requiredDemoSecret("DEMO_REFUND_SECRET"));
}

/**
 * Demo-only synthetic withdrawal reference — explicitly NOT a real anchor
 * `id`/`memo` pair (real SEP-6 fields, Architecture §09). Mirrors the shape
 * (opaque id string + numeric MEMO_ID-compatible string) without calling the
 * real anchor, since both Phase 4 scenarios are deliberately anchor-independent.
 */
export function generateSyntheticWithdrawal(label: string): { idStr: string; memo: string } {
  requireDemoMode();
  const idStr = `demo_${label}_${randomBytes(6).toString("hex")}`;
  const firstDigit = String(1 + Math.floor(Math.random() * 9));
  const restDigits = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join("");
  const memo = firstDigit + restDigits;
  console.log(`[SIMULATED OFF-RAMP] synthetic withdrawal reference generated: id=${idStr} memo=${memo}`);
  return { idStr, memo };
}

/** Scenario A/B step: User sends the real protected amount, on real Testnet,
 * to the Demo Off-Ramp Account — standing in for "User pays the anchor". */
export async function sendUserPaymentToDemoOffRamp(params: {
  userKeypair: Keypair;
  amountDecimal: string; // e.g. "0.5"
  memo: string;
}): Promise<{ hash: string; successful: boolean }> {
  requireDemoMode();
  const offramp = demoOffRampKeypair();
  const account = await HORIZON.loadAccount(params.userKeypair.publicKey());
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.payment({ destination: offramp.publicKey(), asset: USDC, amount: params.amountDecimal }),
    )
    .addMemo(Memo.id(params.memo))
    .setTimeout(60)
    .build();
  tx.sign(params.userKeypair);
  const result = await HORIZON.submitTransaction(tx);
  console.log(
    `[SIMULATED OFF-RAMP] User -> Demo Off-Ramp Account payment: tx=${result.hash} successful=${result.successful}`,
  );
  return { hash: result.hash, successful: result.successful };
}

/** Scenario B step: Demo Refund Account sends a REAL Testnet USDC payment
 * back to the User, standing in for the real anchor's principal-return —
 * the source is simulated, the money movement is real (Bölüm 12 discipline). */
export async function sendDemoRefundPayment(params: {
  userAddress: string;
  amountDecimal: string;
  memo: string;
}): Promise<{ hash: string; successful: boolean }> {
  requireDemoMode();
  const refund = demoRefundKeypair();
  const account = await HORIZON.loadAccount(refund.publicKey());
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.payment({ destination: params.userAddress, asset: USDC, amount: params.amountDecimal }),
    )
    .addMemo(Memo.id(params.memo))
    .setTimeout(60)
    .build();
  tx.sign(refund);
  const result = await HORIZON.submitTransaction(tx);
  console.log(
    `[SIMULATED REFUND SOURCE] Demo Refund Account -> User payment (REAL TESTNET USDC PRINCIPAL RETURN): ` +
      `tx=${result.hash} successful=${result.successful}`,
  );
  return { hash: result.hash, successful: result.successful };
}
