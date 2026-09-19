// Phase 4 / Scenario A: SIMULATED FIAT PAYOUT FAILURE -> REAL TESTNET
// COLLATERAL CLAIM.
//
// Funding is real and independently verified exactly like the Phase 3 happy
// path (open_protection -> AwaitingFunding -> real User payment -> Horizon
// verification -> FUNDED attestation -> Pending, SLA clock genuinely
// starts). The ONLY thing simulated here is what happens after that: no
// SETTLED attestation is ever produced for this protection (TR Mock Anchor
// cannot natively produce a "USDC received but fiat payout failed" outcome —
// confirmed limitation, Architecture §11). Instead we let the real SLA/grace
// clocks (ledger time, not wall clock) run out and exercise the structural
// failure path: Pending -> Grace -> Claimable -> Claimed.
//
// This scenario deliberately NEVER touches the real anchor. The withdrawal
// reference is a demo-only synthetic id/memo (demoOffRampSimulator.ts), and
// the payment destination is the dedicated Demo Off-Ramp Account, not the
// real anchor's account_id.
import { randomBytes } from "node:crypto";
import { Keypair, Horizon } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import {
  demoOffRampKeypair,
  generateSyntheticWithdrawal,
  sendUserPaymentToDemoOffRamp,
} from "../demoOffRampSimulator.ts";
import {
  openProtection,
  getProtection,
  getDomainId,
  submitAttestation,
  advanceToGrace,
  advanceToClaimable,
  claim,
} from "../contractClient.ts";
import { verifyFunding } from "../fundingVerifier.ts";
import { signPayload } from "../sign.ts";
import { waitForLedgerTime } from "../ledgerTime.ts";

const HORIZON = new Horizon.Server("https://horizon-testnet.stellar.org");
const AMOUNT_DECIMAL = "0.5";
const AMOUNT_STROOPS = 5_000_000n;

const FUNDING_DURATION = 180n;
const SLA_DURATION = 30n;
const GRACE_DURATION = 30n;

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

  console.log("[SIMULATED FIAT PAYOUT FAILURE — REAL TESTNET COLLATERAL CLAIM] scenario starting");
  console.log("Demo Off-Ramp Account:", offramp.publicKey());

  section("0. Balances before");
  const gpBefore = await usdcBalance(gpKeypair.publicKey());
  const userBefore = await usdcBalance(userKeypair.publicKey());
  console.log("GP USDC before:", gpBefore, "| User USDC before:", userBefore);

  section("1. Generate demo-only synthetic withdrawal reference");
  const { idStr, memo } = generateSyntheticWithdrawal("failure");
  const anchorWithdrawalId = new TextEncoder().encode(idStr);

  section("2. GP calls open_protection (real Testnet tx) — short demo durations");
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
  let evidence = null;
  for (let i = 0; i < 15 && !evidence; i++) {
    evidence = await verifyFunding({
      destinationAccountId: offramp.publicKey(),
      expectedMemo: memo,
      expectedSenderAddress: userKeypair.publicKey(),
      expectedAmountStroops: AMOUNT_STROOPS,
      usdcIssuer: config.usdcIssuer,
      notBeforeUnixSeconds: Number(recordAfterOpen.created_at),
      anchorReportedStellarTxId: null,
    });
    if (!evidence) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!evidence) throw new Error("Funding NOT independently verified on-chain — refusing to sign FUNDED.");
  console.log("Funding evidence:", evidence);

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
  const slaDeadline = Number(recordAfterFunded.sla_deadline);
  const graceDeadline = Number(recordAfterFunded.grace_deadline);

  section("6. [SIMULATED FIAT PAYOUT FAILURE] informational FAILED attestation (does not change state)");
  const failedTimestamp = BigInt(Math.floor(Date.now() / 1000));
  const failedNonce = randomBytes(32);
  const failedPayload = {
    anchor_withdrawal_id: anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: { tag: "Failed" as const, values: undefined },
    timestamp: failedTimestamp,
    nonce: failedNonce,
    domain_id: domainId,
  };
  const signedFailed = signPayload({
    anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: "Failed",
    timestamp: failedTimestamp,
    nonce: failedNonce,
    domainId,
  });
  const failedSubmit = await submitAttestation(relayerKeypair, failedPayload, signedFailed.signature);
  console.log("[SIMULATED FIAT PAYOUT FAILURE] FAILED attestation tx hash:", failedSubmit.sendTransactionResponse?.hash ?? "(see result)");
  const recordAfterFailed: any = await getProtection(anchorWithdrawalId);
  console.log("Protection record after informational FAILED (state must be unchanged):", recordAfterFailed);
  if (recordAfterFailed.state?.tag !== "Pending") {
    throw new Error("STOP: FAILED attestation must not change state away from Pending.");
  }

  section("7. Wait for real SLA deadline (ledger time, not wall clock), then advance_to_grace");
  await waitForLedgerTime(slaDeadline);
  const graceAdvance = await advanceToGrace(relayerKeypair, anchorWithdrawalId);
  console.log("advance_to_grace tx hash:", graceAdvance.sendTransactionResponse?.hash ?? "(see result)");
  const recordAfterGrace: any = await getProtection(anchorWithdrawalId);
  console.log("Protection record after advance_to_grace:", recordAfterGrace);
  if (recordAfterGrace.state?.tag !== "Grace") throw new Error("STOP: expected Grace state.");

  section("8. Wait for real grace deadline (ledger time), then advance_to_claimable");
  await waitForLedgerTime(graceDeadline);
  const claimableAdvance = await advanceToClaimable(relayerKeypair, anchorWithdrawalId);
  console.log("advance_to_claimable tx hash:", claimableAdvance.sendTransactionResponse?.hash ?? "(see result)");
  const recordAfterClaimable: any = await getProtection(anchorWithdrawalId);
  console.log("Protection record after advance_to_claimable:", recordAfterClaimable);
  if (recordAfterClaimable.state?.tag !== "Claimable") throw new Error("STOP: expected Claimable state.");

  section("9. User calls claim()");
  const claimResult = await claim(userKeypair, anchorWithdrawalId);
  console.log("claim tx hash:", claimResult.sendTransactionResponse?.hash ?? "(see result)");

  section("10. Final verification");
  const finalRecord: any = await getProtection(anchorWithdrawalId);
  console.log("Final protection record:", finalRecord);
  if (finalRecord.state?.tag !== "Claimed") throw new Error("STOP: expected Claimed state.");

  const gpAfter = await usdcBalance(gpKeypair.publicKey());
  const userAfter = await usdcBalance(userKeypair.publicKey());
  console.log("GP USDC after:", gpAfter, "(should be UNCHANGED from before — collateral did NOT return to GP)");
  console.log("User USDC after:", userAfter, `(should be ~${AMOUNT_DECIMAL} USDC higher than before minus the ${AMOUNT_DECIMAL} USDC it paid to the Demo Off-Ramp Account, net collateral received)`);

  console.log("\n[SIMULATED FIAT PAYOUT FAILURE — REAL TESTNET COLLATERAL CLAIM] SCENARIO COMPLETE.");
  console.log(JSON.stringify({
    anchorWithdrawalId: idStr,
    memo,
    openProtectionTx: openResult.sendTransactionResponse?.hash,
    userToOfframpTx: userPayment.hash,
    fundedTx: fundedSubmit.sendTransactionResponse?.hash,
    failedTx: failedSubmit.sendTransactionResponse?.hash,
    advanceToGraceTx: graceAdvance.sendTransactionResponse?.hash,
    advanceToClaimableTx: claimableAdvance.sendTransactionResponse?.hash,
    claimTx: claimResult.sendTransactionResponse?.hash,
    gpBefore, gpAfter, userBefore, userAfter,
    finalRecord,
  }, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
}

main().catch((e) => {
  console.error("SCENARIO A (FAILURE -> CLAIM) FAILED:", e);
  process.exit(1);
});
