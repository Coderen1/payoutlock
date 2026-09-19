// Direct browser -> Soroban RPC reads. This is the app's actual source of
// truth for protection state — the backend's opinion is never trusted for
// display/enablement decisions, only used to trigger the secret-requiring
// write actions (open/FUNDED/SETTLED/REFUNDED signing).
import { contract, rpc } from "@stellar/stellar-sdk";
import { getAppConfig } from "./apiConfig";

const { Client } = contract;

let readClientPromise: Promise<InstanceType<typeof Client>> | null = null;

async function readClient() {
  if (!readClientPromise) {
    readClientPromise = getAppConfig().then((cfg) =>
      Client.from({ contractId: cfg.contractId, networkPassphrase: cfg.networkPassphrase, rpcUrl: cfg.rpcUrl }),
    );
  }
  return readClientPromise;
}

export type ProtectionStateTag =
  | "AwaitingFunding"
  | "Pending"
  | "Grace"
  | "Claimable"
  | "Settled"
  | "Refunded"
  | "Claimed"
  | "Expired";

export interface ProtectionRecord {
  anchor_withdrawal_id: unknown;
  anchor_memo: unknown;
  user: string;
  guarantee_provider: string;
  collateral_amount: bigint;
  created_at: bigint;
  funding_duration: bigint;
  sla_duration: bigint;
  grace_duration: bigint;
  funding_deadline: bigint;
  funded_at: bigint | null;
  sla_deadline: bigint | null;
  grace_deadline: bigint | null;
  state: { tag: ProtectionStateTag };
  last_attested_status: { tag: string };
}

/** Returns null (not an error) if the protection doesn't exist on-chain yet
 * — callers use this to mean "not opened yet / still propagating", not to
 * mean "the network failed". */
export async function readProtection(anchorWithdrawalId: string): Promise<ProtectionRecord | null> {
  const client = await readClient();
  try {
    const tx = await (client as any).get_protection({
      anchor_withdrawal_id: new TextEncoder().encode(anchorWithdrawalId),
    });
    return (tx.result as { unwrap(): ProtectionRecord }).unwrap();
  } catch {
    return null;
  }
}

export async function currentLedgerCloseTime(): Promise<number> {
  const cfg = await getAppConfig();
  const server = new rpc.Server(cfg.rpcUrl);
  const latest = await server.getLatestLedger();
  return Number(latest.closeTime);
}
