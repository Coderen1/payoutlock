// DEMO_MODE-only orchestration for the two Demo Assurance Scenarios
// (Phase 4 logic, exposed as an API). This router is only ever mounted by
// app.ts when serverConfig.demoMode is true — see the guard there — mirroring
// the same guard demoOffRampSimulator.ts enforces at the function level.
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../../config.ts";
import { openProtection, getProtection, getDomainId, submitAttestation } from "../../contractClient.ts";
import { verifyFunding } from "../../fundingVerifier.ts";
import { verifyRefund } from "../../refundVerifier.ts";
import { signPayload } from "../../sign.ts";
import {
  demoOffRampKeypair,
  demoRefundKeypair,
  generateSyntheticWithdrawal,
  sendDemoRefundPayment,
} from "../../demoOffRampSimulator.ts";
import { serverConfig } from "../config.ts";
import { requireSession } from "../auth.ts";
import { rateLimit } from "../rateLimit.ts";
import { withIdempotency } from "../idempotency.ts";
import { releaseTerminalSlotsForWallet } from "../keeper.ts";
import { toJsonSafe } from "../json.ts";
import {
  activeProtectionCount,
  trackProtection,
  untrackProtection,
  setProtectionMeta,
  getProtectionMeta,
} from "../store.ts";
import { isValidWithdrawalIdString, isValidDurationSeconds, isWithinAmountCap, decimalToStroops } from "../validation.ts";
import { assertSufficientProviderLiquidity, InsufficientProviderLiquidityError } from "../providerLiquidity.ts";

export const demoRoutes = Router();
demoRoutes.use(requireSession, rateLimit);

const gpKeypair = Keypair.fromSecret(config.guaranteeProviderSecret);
const relayerKeypair = Keypair.fromSecret(config.relayerSecret);

function idHex(idBytes: Uint8Array): string {
  return Buffer.from(idBytes).toString("hex");
}

async function openDemoProtection(params: {
  label: "failure" | "refund";
  userAddress: string;
  amountDecimal: string;
  fundingDuration: number;
  slaDuration: number;
  graceDuration: number;
}) {
  const collateralAmount = decimalToStroops(params.amountDecimal);
  if (!isWithinAmountCap(collateralAmount)) throw new Error("amount_exceeds_cap");

  // Checked BEFORE any contract simulation is attempted — same discipline as
  // /api/live/open-protection (Phase 5 finding: undersized GP balance
  // otherwise only surfaces as a raw Soroban HostError from simulation).
  await assertSufficientProviderLiquidity(gpKeypair.publicKey(), collateralAmount);

  const { idStr, memo } = generateSyntheticWithdrawal(params.label);
  const idBytes = new TextEncoder().encode(idStr);
  const offramp = demoOffRampKeypair();

  const openResult = await openProtection(gpKeypair, {
    guarantee_provider: gpKeypair.publicKey(),
    anchor_withdrawal_id: idBytes,
    anchor_memo: new TextEncoder().encode(memo),
    user: params.userAddress,
    collateral_amount: collateralAmount,
    funding_duration: BigInt(params.fundingDuration),
    sla_duration: BigInt(params.slaDuration),
    grace_duration: BigInt(params.graceDuration),
  });

  const hex = idHex(idBytes);
  trackProtection(params.userAddress, hex);
  setProtectionMeta(hex, {
    kind: params.label === "failure" ? "demo-failure" : "demo-refund",
    userAddress: params.userAddress,
    destinationAddress: offramp.publicKey(),
    expectedMemo: memo,
    collateralAmountStroops: collateralAmount,
    fundedAttestationSubmitted: false,
  });

  const record = await getProtection(idBytes);
  return {
    anchorWithdrawalId: idStr,
    memo,
    demoOffRampAddress: offramp.publicKey(),
    collateralAmountStroops: collateralAmount.toString(),
    txHash: openResult.sendTransactionResponse?.hash,
    record: toJsonSafe(record),
  };
}

async function respondToOpenOutcome(
  res: import("express").Response,
  run: () => ReturnType<typeof withIdempotency>,
): Promise<void> {
  try {
    const outcome = await run();
    if (outcome.status === "pending") res.status(409).json({ error: "request_already_in_progress" });
    else if (outcome.status === "error") res.status(400).json({ error: outcome.error });
    else res.json(outcome.result);
  } catch (e) {
    if (e instanceof InsufficientProviderLiquidityError) {
      res.status(409).json({
        error: "insufficient_provider_liquidity",
        requestedCollateralStroops: e.requestedCollateralStroops.toString(),
        availableProviderLiquidityStroops: e.availableProviderLiquidityStroops.toString(),
      });
      return;
    }
    throw e;
  }
}

demoRoutes.post("/failure/open", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { amountDecimal, fundingDuration, slaDuration, graceDuration, idempotencyKey } = req.body ?? {};
  const funding = fundingDuration ?? 180;
  const sla = slaDuration ?? 30;
  const grace = graceDuration ?? 30;
  if (![funding, sla, grace].every(isValidDurationSeconds)) {
    res.status(400).json({ error: "invalid_duration" });
    return;
  }
  await releaseTerminalSlotsForWallet(userAddress); // slots held by already-finished protections must not count
  if (activeProtectionCount(userAddress) >= serverConfig.maxActiveProtectionsPerWallet) {
    res.status(429).json({ error: "too_many_active_protections_for_wallet" });
    return;
  }
  await respondToOpenOutcome(res, () =>
    withIdempotency(idempotencyKey, () =>
      openDemoProtection({
        label: "failure",
        userAddress,
        amountDecimal: typeof amountDecimal === "string" ? amountDecimal : "0.5",
        fundingDuration: funding,
        slaDuration: sla,
        graceDuration: grace,
      }),
    ),
  );
});

demoRoutes.post("/refund/open", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { amountDecimal, fundingDuration, slaDuration, graceDuration, idempotencyKey } = req.body ?? {};
  const funding = fundingDuration ?? 180;
  const sla = slaDuration ?? 3600;
  const grace = graceDuration ?? 1800;
  if (![funding, sla, grace].every(isValidDurationSeconds)) {
    res.status(400).json({ error: "invalid_duration" });
    return;
  }
  await releaseTerminalSlotsForWallet(userAddress); // slots held by already-finished protections must not count
  if (activeProtectionCount(userAddress) >= serverConfig.maxActiveProtectionsPerWallet) {
    res.status(429).json({ error: "too_many_active_protections_for_wallet" });
    return;
  }
  await respondToOpenOutcome(res, () =>
    withIdempotency(idempotencyKey, () =>
      openDemoProtection({
        label: "refund",
        userAddress,
        amountDecimal: typeof amountDecimal === "string" ? amountDecimal : "0.5",
        fundingDuration: funding,
        slaDuration: sla,
        graceDuration: grace,
      }),
    ),
  );
});

/** Horizon-only funding check + FUNDED signing, shared shape with
 * /api/live/check-funding but scoped to demo-opened protections. */
demoRoutes.post("/check-funding", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { anchorWithdrawalId } = req.body ?? {};
  if (!isValidWithdrawalIdString(anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_anchor_withdrawal_id" });
    return;
  }
  const idBytes = new TextEncoder().encode(anchorWithdrawalId);
  const hex = idHex(idBytes);
  const meta = getProtectionMeta(hex);
  if (!meta || meta.userAddress !== userAddress || meta.kind === "live") {
    res.status(404).json({ error: "unknown_demo_protection" });
    return;
  }

  const record: any = await getProtection(idBytes).catch(() => null);
  if (!record) {
    res.status(404).json({ error: "protection_not_found_on_chain" });
    return;
  }
  if (record.state?.tag !== "AwaitingFunding") {
    res.json({ alreadyPastFunding: true, record: toJsonSafe(record) });
    return;
  }

  const evidence = await verifyFunding({
    destinationAccountId: meta.destinationAddress,
    expectedMemo: meta.expectedMemo,
    expectedSenderAddress: userAddress,
    expectedAmountStroops: meta.collateralAmountStroops,
    usdcIssuer: config.usdcIssuer,
    notBeforeUnixSeconds: Number(record.created_at),
    anchorReportedStellarTxId: null,
  });
  if (!evidence) {
    res.json({ funded: false });
    return;
  }

  const domainId = await getDomainId();
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(32);
  const payload = {
    anchor_withdrawal_id: idBytes,
    user: userAddress,
    amount: meta.collateralAmountStroops,
    asset: config.usdcSacId,
    status: { tag: "Funded" as const, values: undefined },
    timestamp,
    nonce,
    domain_id: domainId,
  };
  const signed = signPayload({
    anchorWithdrawalId: idBytes,
    user: userAddress,
    amount: meta.collateralAmountStroops,
    asset: config.usdcSacId,
    status: "Funded",
    timestamp,
    nonce,
    domainId,
  });
  const submit = await submitAttestation(relayerKeypair, payload, signed.signature);
  meta.fundedAttestationSubmitted = true;
  const updatedRecord = await getProtection(idBytes);
  res.json({ funded: true, fundedTx: submit.sendTransactionResponse?.hash, evidence: toJsonSafe(evidence), record: toJsonSafe(updatedRecord) });
});

/** [SIMULATED FIAT PAYOUT FAILURE] — informational only, never changes state. */
demoRoutes.post("/failure/trigger-failed", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { anchorWithdrawalId } = req.body ?? {};
  if (!isValidWithdrawalIdString(anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_anchor_withdrawal_id" });
    return;
  }
  const idBytes = new TextEncoder().encode(anchorWithdrawalId);
  const hex = idHex(idBytes);
  const meta = getProtectionMeta(hex);
  if (!meta || meta.userAddress !== userAddress || meta.kind !== "demo-failure") {
    res.status(404).json({ error: "unknown_demo_protection" });
    return;
  }
  const record: any = await getProtection(idBytes).catch(() => null);
  if (!record || record.state?.tag !== "Pending") {
    res.status(409).json({ error: "not_in_pending_state" });
    return;
  }

  const domainId = await getDomainId();
  const timestamp = BigInt(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(32);
  const payload = {
    anchor_withdrawal_id: idBytes,
    user: userAddress,
    amount: meta.collateralAmountStroops,
    asset: config.usdcSacId,
    status: { tag: "Failed" as const, values: undefined },
    timestamp,
    nonce,
    domain_id: domainId,
  };
  const signed = signPayload({
    anchorWithdrawalId: idBytes,
    user: userAddress,
    amount: meta.collateralAmountStroops,
    asset: config.usdcSacId,
    status: "Failed",
    timestamp,
    nonce,
    domainId,
  });
  console.log(`[SIMULATED FIAT PAYOUT FAILURE] signing informational FAILED for ${anchorWithdrawalId}`);
  const submit = await submitAttestation(relayerKeypair, payload, signed.signature);
  const updatedRecord = await getProtection(idBytes);
  res.json({ failedTx: submit.sendTransactionResponse?.hash, record: toJsonSafe(updatedRecord) });
});

/** [SIMULATED REFUND SOURCE — REAL TESTNET USDC PRINCIPAL RETURN] */
demoRoutes.post("/refund/trigger-refund", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { anchorWithdrawalId, idempotencyKey } = req.body ?? {};
  if (!isValidWithdrawalIdString(anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_anchor_withdrawal_id" });
    return;
  }
  const idBytes = new TextEncoder().encode(anchorWithdrawalId);
  const hex = idHex(idBytes);
  const meta = getProtectionMeta(hex);
  if (!meta || meta.userAddress !== userAddress || meta.kind !== "demo-refund") {
    res.status(404).json({ error: "unknown_demo_protection" });
    return;
  }

  const outcome = await withIdempotency(idempotencyKey, async () => {
    const record: any = await getProtection(idBytes).catch(() => null);
    if (!record || !["Pending", "Grace"].includes(record.state?.tag)) {
      throw new Error("not_in_refundable_state");
    }
    const amountDecimal = (Number(meta.collateralAmountStroops) / 10_000_000).toFixed(7);

    const refundPayment = await sendDemoRefundPayment({
      userAddress,
      amountDecimal,
      memo: meta.expectedMemo,
    });
    if (!refundPayment.successful) throw new Error("demo_refund_payment_failed");

    let refundEvidence = null;
    for (let i = 0; i < 15 && !refundEvidence; i++) {
      refundEvidence = await verifyRefund({
        expectedSenderAddress: demoRefundKeypair().publicKey(),
        expectedRecipientAddress: userAddress,
        expectedAmountStroops: meta.collateralAmountStroops,
        usdcIssuer: config.usdcIssuer,
        expectedMemo: meta.expectedMemo,
        notBeforeUnixSeconds: Number(record.funded_at ?? record.created_at),
      });
      if (!refundEvidence) await new Promise((r) => setTimeout(r, 2000));
    }
    if (!refundEvidence) throw new Error("refund_not_independently_verified");

    const domainId = await getDomainId();
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(32);
    const payload = {
      anchor_withdrawal_id: idBytes,
      user: userAddress,
      amount: meta.collateralAmountStroops,
      asset: config.usdcSacId,
      status: { tag: "Refunded" as const, values: undefined },
      timestamp,
      nonce,
      domain_id: domainId,
    };
    const signed = signPayload({
      anchorWithdrawalId: idBytes,
      user: userAddress,
      amount: meta.collateralAmountStroops,
      asset: config.usdcSacId,
      status: "Refunded",
      timestamp,
      nonce,
      domainId,
    });
    const submit = await submitAttestation(relayerKeypair, payload, signed.signature);
    untrackProtection(userAddress, hex);
    const updatedRecord = await getProtection(idBytes);
    return {
      demoRefundTx: refundPayment.hash,
      refundEvidence: toJsonSafe(refundEvidence),
      refundedTx: submit.sendTransactionResponse?.hash,
      record: toJsonSafe(updatedRecord),
    };
  });

  if (outcome.status === "pending") res.status(409).json({ error: "request_already_in_progress" });
  else if (outcome.status === "error") res.status(400).json({ error: outcome.error });
  else res.json(outcome.result);
});
