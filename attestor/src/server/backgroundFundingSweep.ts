// Liveness safety net: even if the frontend never calls /check-funding (tab
// closed, network hiccup, etc.), this periodically re-checks every tracked
// AwaitingFunding protection against Horizon and signs FUNDED once genuinely
// verified — same discipline as Phase 3's eventWatcher.ts, generalized to
// also cover the demo-opened protections. Horizon-only: funding verification
// never uses the anchor JWT.
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { getProtection, getDomainId, submitAttestation } from "../contractClient.ts";
import { verifyFunding } from "../fundingVerifier.ts";
import { signPayload } from "../sign.ts";
import { allProtectionMetaEntries } from "./store.ts";

const relayerKeypair = Keypair.fromSecret(config.relayerSecret);

async function sweepOnce(): Promise<void> {
  for (const [hex, meta] of allProtectionMetaEntries()) {
    if (meta.fundedAttestationSubmitted || meta.terminalObserved) continue;
    const idBytes = Buffer.from(hex, "hex");
    const record: any = await getProtection(idBytes).catch(() => null);
    if (!record || record.state?.tag !== "AwaitingFunding") continue;

    const evidence = await verifyFunding({
      destinationAccountId: meta.destinationAddress,
      expectedMemo: meta.expectedMemo,
      expectedSenderAddress: meta.userAddress,
      expectedAmountStroops: meta.collateralAmountStroops,
      usdcIssuer: config.usdcIssuer,
      notBeforeUnixSeconds: Number(record.created_at),
      anchorReportedStellarTxId: null,
    }).catch(() => null);
    if (!evidence) continue;

    const domainId = await getDomainId();
    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const nonce = randomBytes(32);
    const payload = {
      anchor_withdrawal_id: idBytes,
      user: meta.userAddress,
      amount: meta.collateralAmountStroops,
      asset: config.usdcSacId,
      status: { tag: "Funded" as const, values: undefined },
      timestamp,
      nonce,
      domain_id: domainId,
    };
    const signed = signPayload({
      anchorWithdrawalId: idBytes,
      user: meta.userAddress,
      amount: meta.collateralAmountStroops,
      asset: config.usdcSacId,
      status: "Funded",
      timestamp,
      nonce,
      domainId,
    });
    try {
      await submitAttestation(relayerKeypair, payload, signed.signature);
      meta.fundedAttestationSubmitted = true;
      console.log(`[backgroundFundingSweep] FUNDED signed for ${hex} (fallback sweep, not the primary /check-funding path)`);
    } catch (e) {
      console.warn(`[backgroundFundingSweep] submit failed for ${hex}:`, e instanceof Error ? e.message : e);
    }
  }
}

export function startBackgroundFundingSweep(intervalMs = 15_000): void {
  const timer = setInterval(() => {
    sweepOnce().catch((e) => console.warn("[backgroundFundingSweep] sweep error:", e));
  }, intervalMs);
  timer.unref();
}



