// Client-signed, permissionless Soroban calls — no backend involvement, no
// secret required. `advance_to_grace`, `advance_to_claimable`, `claim`, and
// `expire_unfunded` all have no `require_auth()` check in the contract, so
// the connected wallet can sign+submit them directly, paying its own fee.
// `signAndSend()` (from @stellar/stellar-sdk's AssembledTransaction, proven
// throughout this project's server-side scripts) polls to final on-chain
// SUCCESS/FAILURE itself — callers must await it fully before treating an
// action as done; a resolved submit is not the same as a resolved poll.
import { contract } from "@stellar/stellar-sdk";
import { getAppConfig } from "./apiConfig";
import { signTransaction } from "./walletsKit";

const { Client } = contract;

async function writeClient(address: string) {
  const cfg = await getAppConfig();
  return Client.from({
    contractId: cfg.contractId,
    networkPassphrase: cfg.networkPassphrase,
    rpcUrl: cfg.rpcUrl,
    publicKey: address,
    signTransaction,
  });
}

function idBytes(anchorWithdrawalId: string): Uint8Array {
  return new TextEncoder().encode(anchorWithdrawalId);
}

export async function advanceToGrace(address: string, anchorWithdrawalId: string) {
  const client = await writeClient(address);
  const tx = await (client as any).advance_to_grace({ anchor_withdrawal_id: idBytes(anchorWithdrawalId) });
  return tx.signAndSend();
}

export async function advanceToClaimable(address: string, anchorWithdrawalId: string) {
  const client = await writeClient(address);
  const tx = await (client as any).advance_to_claimable({ anchor_withdrawal_id: idBytes(anchorWithdrawalId) });
  return tx.signAndSend();
}

export async function claimProtection(address: string, anchorWithdrawalId: string) {
  const client = await writeClient(address);
  const tx = await (client as any).claim({ anchor_withdrawal_id: idBytes(anchorWithdrawalId) });
  return tx.signAndSend();
}

export async function expireUnfunded(address: string, anchorWithdrawalId: string) {
  const client = await writeClient(address);
  const tx = await (client as any).expire_unfunded({ anchor_withdrawal_id: idBytes(anchorWithdrawalId) });
  return tx.signAndSend();
}
