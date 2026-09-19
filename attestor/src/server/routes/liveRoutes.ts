// Real TR Mock Anchor happy-path orchestration (Phase 5). GP/attestor/relayer
// secrets never leave this process; the browser only ever gets back a tx
// hash + the resulting (public) protection record.
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../../config.ts";
import { sep6Transaction } from "../../anchorClient.ts";
import { openProtection, getProtection, getDomainId, submitAttestation } from "../../contractClient.ts";
import { verifyFunding } from "../../fundingVerifier.ts";
import { signPayload } from "../../sign.ts";
import { serverConfig } from "../config.ts";
import { requireSession } from "../auth.ts";
import { rateLimit } from "../rateLimit.ts";
import { withIdempotency } from "../idempotency.ts";
import { releaseTerminalSlotsForWallet } from "../keeper.ts";
import { dropAnchorJwt, holdAnchorJwt } from "../anchorCredentials.ts";
import { toJsonSafe } from "../json.ts";
import { assertSufficientProviderLiquidity, InsufficientProviderLiquidityError } from "../providerLiquidity.ts";
import {
  activeProtectionCount,
  trackProtection,
  untrackProtection,
  setProtectionMeta,
  getProtectionMeta,
} from "../store.ts";
import {
  isValidWithdrawalIdString,
  isValidMemoId,
  isValidDurationSeconds,
  isWithinAmountCap,
  decimalToStroops,
} from "../validation.ts";

export const liveRoutes = Router();
liveRoutes.use(requireSession, rateLimit);

const gpKeypair = Keypair.fromSecret(config.guaranteeProviderSecret);
const relayerKeypair = Keypair.fromSecret(config.relayerSecret);

function idHex(anchorWithdrawalId: Uint8Array): string {
  return Buffer.from(anchorWithdrawalId).toString("hex");
}

async function protectionExists(anchorWithdrawalId: Uint8Array): Promise<boolean> {
  try {
    await getProtection(anchorWithdrawalId);
    return true;
  } catch {
    return false;
  }
}

liveRoutes.post("/open-protection", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { jwt, anchorWithdrawalId, fundingDuration, slaDuration, graceDuration, idempotencyKey } = req.body ?? {};

  if (typeof jwt !== "string" || !jwt) {
    res.status(400).json({ error: "missing_jwt" });
    return;
  }
  if (!isValidWithdrawalIdString(anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_anchor_withdrawal_id" });
    return;
  }
  const funding = fundingDuration ?? 600;
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

  // Server never trusts client-supplied memo/amount — both are DERIVED from
  // the anchor's own JWT-scoped transaction record (Phase 5 finding: this
  // lookup is scoped to the JWT's own account, confirmed empirically — a
  // different account's JWT gets 404, not the real record). The JWT is never
  // logged or persisted; once the protection is open it is kept in server
  // MEMORY only, for the protection's lifetime (anchorCredentials.ts), so the
  // keeper can check the anchor before a live protection becomes claimable.
  // This lookup is read-only, so it happens before (and outside) the
  // idempotency-guarded mutation.
  let anchorTx: Awaited<ReturnType<typeof sep6Transaction>>;
  try {
    anchorTx = await sep6Transaction(jwt, anchorWithdrawalId);
  } catch (e) {
    res.status(400).json({ error: `anchor_lookup_failed: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }

  const memo = (anchorTx as any).withdraw_memo;
  const amountIn = (anchorTx as any).amount_in;
  if (!isValidMemoId(memo)) {
    res.status(400).json({ error: "anchor_memo_invalid_shape" });
    return;
  }
  if (typeof amountIn !== "string") {
    res.status(400).json({ error: "anchor_amount_missing" });
    return;
  }

  const collateralAmount = decimalToStroops(amountIn);
  if (!isWithinAmountCap(collateralAmount)) {
    res.status(400).json({ error: "amount_exceeds_cap" });
    return;
  }

  const idBytes = new TextEncoder().encode(anchorWithdrawalId);
  if (await protectionExists(idBytes)) {
    res.status(409).json({ error: "duplicate_protection" });
    return;
  }

  // Checked BEFORE any contract simulation is attempted — otherwise an
  // undersized GP balance only ever surfaces as a raw Soroban HostError deep
  // inside `openProtection`'s simulation step (Phase 5 finding: real demo
  // failure, "resulting balance is not within allowed range").
  try {
    await assertSufficientProviderLiquidity(gpKeypair.publicKey(), collateralAmount);
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

  const outcome = await withIdempotency(idempotencyKey, async () => {
    const openResult = await openProtection(gpKeypair, {
      guarantee_provider: gpKeypair.publicKey(),
      anchor_withdrawal_id: idBytes,
      anchor_memo: new TextEncoder().encode(memo),
      user: userAddress,
      collateral_amount: collateralAmount,
      funding_duration: BigInt(funding),
      sla_duration: BigInt(sla),
      grace_duration: BigInt(grace),
    });

    const hex = idHex(idBytes);
    trackProtection(userAddress, hex);
    setProtectionMeta(hex, {
      kind: "live",
      userAddress,
      destinationAddress: (anchorTx as any).withdraw_anchor_account,
      expectedMemo: memo,
      collateralAmountStroops: collateralAmount,
      fundedAttestationSubmitted: false,
    });
    holdAnchorJwt(hex, jwt);

    const record = await getProtection(idBytes);
    return {
      txHash: openResult.sendTransactionResponse?.hash,
      destinationAddress: (anchorTx as any).withdraw_anchor_account,
      memo,
      collateralAmountStroops: collateralAmount.toString(),
      record: toJsonSafe(record),
    };
  });

  if (outcome.status === "pending") {
    res.status(409).json({ error: "request_already_in_progress" });
  } else if (outcome.status === "error") {
    res.status(400).json({ error: outcome.error });
  } else {
    res.json(outcome.result);
  }
});

/** Horizon-only (no anchor JWT needed — funding verification has never
 * depended on the anchor's own claims, only independent on-chain evidence).
 * Frontend calls this after the User's payment tx confirms, to prompt a
 * prompt FUNDED check rather than waiting for the background sweep. */
liveRoutes.post("/check-funding", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { anchorWithdrawalId } = req.body ?? {};
  if (!isValidWithdrawalIdString(anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_anchor_withdrawal_id" });
    return;
  }
  const idBytes = new TextEncoder().encode(anchorWithdrawalId);
  const hex = idHex(idBytes);
  const meta = getProtectionMeta(hex);
  if (!meta || meta.userAddress !== userAddress) {
    res.status(404).json({ error: "unknown_protection" });
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

/** Anchor-authoritative: the anchor's own status decides. Takes the User's
 * JWT with the request; a valid one also refreshes the copy the keeper holds in
 * memory (anchorCredentials.ts), which is dropped once the protection ends. */
liveRoutes.post("/check-settlement", async (req, res) => {
  const userAddress = req.session!.publicKey;
  const { jwt, anchorWithdrawalId } = req.body ?? {};
  if (typeof jwt !== "string" || !jwt || !isValidWithdrawalIdString(anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const idBytes = new TextEncoder().encode(anchorWithdrawalId);
  const hex = idHex(idBytes);
  const meta = getProtectionMeta(hex);
  if (!meta || meta.userAddress !== userAddress) {
    res.status(404).json({ error: "unknown_protection" });
    return;
  }

  const record: any = await getProtection(idBytes).catch(() => null);
  if (!record || !["Pending", "Grace"].includes(record.state?.tag)) {
    res.json({ settled: false, record: record ? toJsonSafe(record) : null });
    return;
  }

  let anchorTx;
  try {
    anchorTx = await sep6Transaction(jwt, anchorWithdrawalId);
  } catch (e) {
    res.status(400).json({ error: `anchor_lookup_failed: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }
  holdAnchorJwt(hex, jwt); // the anchor just accepted it — keep the newer one if it outlives the held token
  if ((anchorTx as any).status !== "completed") {
    res.json({ settled: false, anchorStatus: (anchorTx as any).status });
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
    status: { tag: "Settled" as const, values: undefined },
    timestamp,
    nonce,
    domain_id: domainId,
  };
  const signed = signPayload({
    anchorWithdrawalId: idBytes,
    user: userAddress,
    amount: meta.collateralAmountStroops,
    asset: config.usdcSacId,
    status: "Settled",
    timestamp,
    nonce,
    domainId,
  });
  const submit = await submitAttestation(relayerKeypair, payload, signed.signature);
  untrackProtection(userAddress, hex);
  dropAnchorJwt(hex);
  const updatedRecord = await getProtection(idBytes);
  res.json({ settled: true, settledTx: submit.sendTransactionResponse?.hash, record: toJsonSafe(updatedRecord) });
});
