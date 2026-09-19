// Soroban ledger `timestamp()` (what the contract's `now` actually reads)
// lags real wall-clock time by roughly the latest-closed-ledger's close
// interval (observed ~25s in Phase 2 — see `expire_unfunded` timing finding).
// Waiting on wall-clock alone can make a time-gated call (advance_to_grace,
// advance_to_claimable) fail even after the wall-clock deadline has passed.
// This polls the RPC's own view of ledger close time instead.
import { rpc } from "@stellar/stellar-sdk";
import { config } from "./config.ts";

export async function currentLedgerCloseTime(): Promise<number> {
  const server = new rpc.Server(config.rpcUrl);
  const latest = await server.getLatestLedger();
  return Number(latest.closeTime);
}

export async function waitForLedgerTime(targetUnixSeconds: number, pollMs = 5000): Promise<void> {
  for (;;) {
    const closeTime = await currentLedgerCloseTime();
    if (closeTime > targetUnixSeconds) {
      console.log(`  ledger close time ${closeTime} > target ${targetUnixSeconds} — proceeding`);
      return;
    }
    console.log(
      `  ledger close time ${closeTime}, waiting for > ${targetUnixSeconds} (~${targetUnixSeconds - closeTime}s remaining by ledger clock)`,
    );
    await new Promise((r) => setTimeout(r, pollMs));
  }
}
