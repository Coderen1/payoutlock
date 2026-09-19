// Phase 4 / Scenario B: SIMULATED REFUND SOURCE — REAL TESTNET USDC
// PRINCIPAL RETURN.
//
// Funding is real and independently verified exactly like Scenario A / the
// Phase 3 happy path. What's simulated is only the SOURCE of the principal
// refund (TR Mock Anchor has no native refund endpoint — confirmed
// limitation, Architecture §11): the dedicated Demo Refund Account sends a
// REAL Testnet USDC payment of the exact protected amount back to the User.
// The attestor independently verifies that real refund payment on-chain
// (refundVerifier.ts) BEFORE signing REFUNDED — the contract is never given
// an unverified "refund happened" claim.
import { randomBytes } from "node:crypto";
import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import {
  demoOffRampKeypair,
  demoRefundKeypair,
  generateSyntheticWithdrawal,
  sendUserPaymentToDemoOffRamp,
  sendDemoRefundPayment,
} from "../demoOffRampSimulator.ts";
import {
  openProtection,
  getProtection,
  getDomainId,
  submitAttestation,
} from "../contractClient.ts";
import { verifyFunding } from "../fundingVerifier.ts";
import { verifyRefund } from "../refundVerifier.ts";
import { signPayload } from "../sign.ts";

const HORIZON = new Horizon.Server("https://horizon-testnet.stellar.org");
const AMOUNT_DECIMAL = "0.5";
const AMOUNT_STROOPS = 5_000_000n;

const FUNDING_DURATION = 180n;
const SLA_DURATION = 3600n; // large enough that this scenario never needs to race the SLA clock
const GRACE_DURATION = 1800n;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function usdcBalance(pub: string): Promise<string | undefined> {
  const account = await HORIZON.loadAccount(pub);
  return account.balances.find((b: any) => b.asset_code === "USDC")?.balance;
}

async function main() {
  if (process.env.DEMO_MODE !== "true") {
    throw new Error("Refusing to run: set DEMO_MODE=true explicitly for this demo scenario.");
  }

  const gpKeypair = Keypair.fromSecret(config.guaranteeProviderSecret);
  const userKeypair = Keypair.fromSecret(config.userSecret);
  const relayerKeypair = Keypair.fromSecret(config.relayerSecret);
  const offramp = demoOffRampKeypair();
  const refund = demoRefundKeypair();

  console.log("[SIMULATED REFUND SOURCE — REAL TESTNET USDC PRINCIPAL RETURN] scenario starting");
  console.log("Demo Off-Ramp Account:", offramp.publicKey());
  console.log("Demo Refund Account:", refund.publicKey());

  section("0. Balances before");
  const gpBefore = await usdcBalance(gpKeypair.publicKey());
  const userBefore = await usdcBalance(userKeypair.publicKey());
  const refundAcctBefore = await usdcBalance(refund.publicKey());
  console.log("GP USDC before:", gpBefore, "| User USDC before:", userBefore, "| Demo Refund Account USDC before:", refundAcctBefore);

  section("1. Generate demo-only synthetic withdrawal reference (separate protection from Scenario A)");
  const { idStr, memo } = generateSyntheticWithdrawal("refund");
  const anchorWithdrawalId = new TextEncoder().encode(idStr);

  section("2. GP calls open_protection (real Testnet tx)");
  const openResult = await openProtection(gpKeypair, {
    guarantee_provider: gpKeypair.publicKey(),
    anchor_withdrawal_id: anchorWithdrawalId,
    anchor_memo: new TextEncoder().encode(memo),
    user: userKeypair.publicKey(),
    collateral_amount: AMOUNT_STROOPS,
    funding_duration: FUNDING_DURATION,
    sla_duration: SLA_DURATION,
    grace_duration: GRACE_DURATION,
  });
  console.log("open_protection tx hash:", openResult.sendTransactionResponse?.hash ?? "(see result)");
  const recordAfterOpen: any = await getProtection(anchorWithdrawalId);
  console.log("Protection record after open:", recordAfterOpen);
  if (recordAfterOpen.state?.tag !== "AwaitingFunding") {
    throw new Error(`STOP: expected AwaitingFunding after open_protection, got ${recordAfterOpen.state?.tag}`);
  }

  section("3. User sends REAL Testnet USDC payment to Demo Off-Ramp Account");
  const userPayment = await sendUserPaymentToDemoOffRamp({
    userKeypair,
    amountDecimal: AMOUNT_DECIMAL,
    memo,
  });
  if (!userPayment.successful) throw new Error("User -> Demo Off-Ramp payment was not successful.");

  section("4. Independent on-chain funding verification (Horizon)");
  let fundingEvidence = null;
  for (let i = 0; i < 15 && !fundingEvidence; i++) {
    fundingEvidence = await verifyFunding({
      destinationAccountId: offramp.publicKey(),
      expectedMemo: memo,
      expectedSenderAddress: userKeypair.publicKey(),
      expectedAmountStroops: AMOUNT_STROOPS,
      usdcIssuer: config.usdcIssuer,
      notBeforeUnixSeconds: Number(recordAfterOpen.created_at),
      anchorReportedStellarTxId: null,
    });
    if (!fundingEvidence) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!fundingEvidence) throw new Error("Funding NOT independently verified on-chain — refusing to sign FUNDED.");
  console.log("Funding evidence:", fundingEvidence);

  section("5. Attestor signs FUNDED, Relayer submits");
  const domainId = await getDomainId();
  const fundedTimestamp = BigInt(Math.floor(Date.now() / 1000));
  const fundedNonce = randomBytes(32);
  const fundedPayload = {
    anchor_withdrawal_id: anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: { tag: "Funded" as const, values: undefined },
    timestamp: fundedTimestamp,
    nonce: fundedNonce,
    domain_id: domainId,
  };
  const signedFunded = signPayload({
    anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: "Funded",
    timestamp: fundedTimestamp,
    nonce: fundedNonce,
    domainId,
  });
  const fundedSubmit = await submitAttestation(relayerKeypair, fundedPayload, signedFunded.signature);
  console.log("FUNDED attestation tx hash:", fundedSubmit.sendTransactionResponse?.hash ?? "(see result)");

  const recordAfterFunded: any = await getProtection(anchorWithdrawalId);
  console.log("Protection record after FUNDED:", recordAfterFunded);
  if (recordAfterFunded.state?.tag !== "Pending") {
    throw new Error("STOP: state is not Pending after FUNDED.");
  }
  const fundedAt = Number(recordAfterFunded.funded_at);

  section("6. [SIMULATED REFUND SOURCE] Demo Refund Account sends REAL Testnet USDC back to User");
  const refundPayment = await sendDemoRefundPayment({
    userAddress: userKeypair.publicKey(),
    amountDecimal: AMOUNT_DECIMAL,
    memo,
  });
  if (!refundPayment.successful) throw new Error("Demo Refund Account -> User payment was not successful.");

  section("7. Attestor independently verifies the refund payment on-chain (Horizon) BEFORE signing REFUNDED");
  let refundEvidence = null;
  for (let i = 0; i < 15 && !refundEvidence; i++) {
    refundEvidence = await verifyRefund({
      expectedSenderAddress: refund.publicKey(),
      expectedRecipientAddress: userKeypair.publicKey(),
      expectedAmountStroops: AMOUNT_STROOPS,
      usdcIssuer: config.usdcIssuer,
      expectedMemo: memo,
      notBeforeUnixSeconds: fundedAt,
    });
    if (!refundEvidence) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!refundEvidence) throw new Error("Refund NOT independently verified on-chain — refusing to sign REFUNDED.");
  console.log("Refund evidence:", refundEvidence);

  section("8. Attestor signs REFUNDED, Relayer submits");
  const refundedTimestamp = BigInt(Math.floor(Date.now() / 1000));
  const refundedNonce = randomBytes(32);
  const refundedPayload = {
    anchor_withdrawal_id: anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: { tag: "Refunded" as const, values: undefined },
    timestamp: refundedTimestamp,
    nonce: refundedNonce,
    domain_id: domainId,
  };
  const signedRefunded = signPayload({
    anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: "Refunded",
    timestamp: refundedTimestamp,
    nonce: refundedNonce,
    domainId,
  });
  const refundedSubmit = await submitAttestation(relayerKeypair, refundedPayload, signedRefunded.signature);
  console.log("REFUNDED attestation tx hash:", refundedSubmit.sendTransactionResponse?.hash ?? "(see result)");

  section("9. Final verification");
  const finalRecord: any = await getProtection(anchorWithdrawalId);
  console.log("Final protection record:", finalRecord);
  if (finalRecord.state?.tag !== "Refunded") throw new Error("STOP: expected Refunded state.");

  const gpAfter = await usdcBalance(gpKeypair.publicKey());
  const userAfter = await usdcBalance(userKeypair.publicKey());
  const refundAcctAfter = await usdcBalance(refund.publicKey());
  console.log("GP USDC after:", gpAfter, "(collateral should be fully back with GP)");
  console.log("User USDC after:", userAfter, "(should be ~equal to before — paid out, then made whole by the refund)");
  console.log("Demo Refund Account USDC after:", refundAcctAfter);

  console.log("\n[SIMULATED REFUND SOURCE — REAL TESTNET USDC PRINCIPAL RETURN] SCENARIO COMPLETE.");
  console.log(JSON.stringify({
    anchorWithdrawalId: idStr,
    memo,
    openProtectionTx: openResult.sendTransactionResponse?.hash,
    userToOfframpTx: userPayment.hash,
    fundedTx: fundedSubmit.sendTransactionResponse?.hash,
    demoRefundTx: refundPayment.hash,
    refundedTx: refundedSubmit.sendTransactionResponse?.hash,
    gpBefore, gpAfter, userBefore, userAfter, refundAcctBefore, refundAcctAfter,
    finalRecord,
  }, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
}

main().catch((e) => {
  console.error("SCENARIO B (REFUND) FAILED:", e);
  process.exit(1);
});
