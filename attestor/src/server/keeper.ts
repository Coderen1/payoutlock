// Thin keeper: wires keeperCore.ts to the real relayer, contract, Horizon and
// (for live protections) the anchor. The rules — including the guard that keeps
// a live protection in Grace unless the anchor is freshly observed to be
// unresolved — and why they are safe live in keeperCore.ts. Like the
// backgroundFundingSweep, this only knows protections this API process opened
// (the store is in-memory by design) — anything opened before a restart is
// left to the manual controls in /developer.
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { getProtection, advanceToGrace, advanceToClaimable, expireUnfunded } from "../contractClient.ts";
import { sep6Transaction } from "../anchorClient.ts";
import { verifyFunding } from "../fundingVerifier.ts";
import { currentLedgerCloseTime } from "../ledgerTime.ts";
import { getAnchorJwt, redactAnchorJwt } from "./anchorCredentials.ts";
import { serverConfig } from "./config.ts";
import { releaseProtection } from "./protectionRelease.ts";
import { allProtectionMetaEntries, getProtectionMeta, trackedProtectionIds } from "./store.ts";
import {
  createKeeper,
  releaseTerminalSlots,
  type KeeperDeps,
  type KeeperRecord,
} from "./keeperCore.ts";

const relayerKeypair = Keypair.fromSecret(config.relayerSecret);

const idBytes = (hex: string) => Buffer.from(hex, "hex");


async function readRecord(hex: string): Promise<KeeperRecord | null> {
  try {
    return (await getProtection(idBytes(hex))) as KeeperRecord;
  } catch {
    return null; // not-found and transient RPC errors both mean "can't tell right now"
  }
}

const realDeps: KeeperDeps = {
  listEntries: () =>
    allProtectionMetaEntries().map(([hex, meta]) => ({
      hex,
      walletAddress: meta.userAddress,
      terminalObserved: meta.terminalObserved === true,
      kind: meta.kind,
    })),
  markTerminalObserved: (hex) => {
    const meta = getProtectionMeta(hex);
    if (meta) meta.terminalObserved = true;
  },
  releaseSlot: releaseProtection,
  ledgerNow: currentLedgerCloseTime,
  getRecord: readRecord,
  hasFundingEvidence: async (hex, record) => {
    const meta = getProtectionMeta(hex);
    if (!meta) throw new Error("no protection metadata to verify funding against");
    const evidence = await verifyFunding({
      destinationAccountId: meta.destinationAddress,
      expectedMemo: meta.expectedMemo,
      expectedSenderAddress: meta.userAddress,
      expectedAmountStroops: meta.collateralAmountStroops,
      usdcIssuer: config.usdcIssuer,
      notBeforeUnixSeconds: Number(record.created_at),
      anchorReportedStellarTxId: null,
    });
    return evidence !== null;
  },
  observeAnchorStatus: async (hex) => {
    const jwt = getAnchorJwt(hex);
    if (!jwt) return null; // none held, or expired — the keeper treats that as "cannot confirm", never as "unresolved"
    try {
      const tx = await sep6Transaction(jwt, Buffer.from(hex, "hex").toString("utf8"));
      return typeof tx.status === "string" ? tx.status : "";
    } catch (e) {
      throw new Error(redactAnchorJwt(hex, e instanceof Error ? e.message : String(e)));
    }
  },
  advanceToGrace: async (hex) => (await advanceToGrace(relayerKeypair, idBytes(hex))).sendTransactionResponse?.hash,
  advanceToClaimable: async (hex) =>
    (await advanceToClaimable(relayerKeypair, idBytes(hex))).sendTransactionResponse?.hash,
  expireUnfunded: async (hex) => (await expireUnfunded(relayerKeypair, idBytes(hex))).sendTransactionResponse?.hash,
  log: { info: (m) => console.log(m), warn: (m) => console.warn(m) },
  expireBufferSeconds: serverConfig.keeperExpireBufferSeconds,
};

/** Called by the open-protection routes right before the per-wallet cap check,
 * so a protection that has already finished never blocks the next one. Never
 * throws: if the chain can't be read, the slot simply stays taken. */
export async function releaseTerminalSlotsForWallet(walletAddress: string): Promise<number> {
  try {
    return await releaseTerminalSlots(walletAddress, {
      trackedIds: trackedProtectionIds,
      getRecord: readRecord,
      releaseSlot: releaseProtection,
    });
  } catch (e) {
    console.warn("[keeper] slot release before cap check failed:", e instanceof Error ? e.message : e);
    return 0;
  }
}

export function startKeeper(): void {
  if (!serverConfig.keeperEnabled) {
    console.log("[keeper] disabled (KEEPER_ENABLED=false) — only the /developer manual controls advance state.");
    return;
  }
  const keeper = createKeeper(realDeps);
  let running = false; // a slow submit must not overlap the next tick and double-submit
  setInterval(() => {
    if (running) return;
    running = true;
    keeper
      .tick()
      .catch((e) => console.warn("[keeper] tick error:", e))
      .finally(() => {
        running = false;
      });
  }, serverConfig.keeperIntervalMs).unref();
  console.log(
    `[keeper] started (every ${serverConfig.keeperIntervalMs / 1000}s, expire buffer ${serverConfig.keeperExpireBufferSeconds}s)`,
  );
}
