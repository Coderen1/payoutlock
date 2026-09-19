// Thin wrapper around @stellar/stellar-sdk's auto-generated contract.Client
// (built from the contract's own on-chain spec — Bölüm 9's prepare/simulate/
// assemble/sign/submit/poll flow is handled internally by signAndSend()).
import { Keypair, contract } from "@stellar/stellar-sdk";
import { config } from "./config.ts";

const { Client } = contract;

async function clientFor(keypair?: Keypair) {
  return Client.from({
    contractId: config.contractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: keypair?.publicKey(),
    signTransaction: keypair,
  });
}

/** Read-only. No signing identity needed — simulation alone is enough.
 * `get_protection` returns `Result<ProtectionRecord, Error>` on the Rust
 * side, which the SDK surfaces as an `Ok`/`Err` wrapper (Bölüm — real SDK
 * behavior found in Phase 3) — `.unwrap()` here mirrors Rust's own `?`/panic
 * semantics: throws if the record doesn't exist. */
export async function getProtection(anchorWithdrawalId: Uint8Array) {
  const client = await clientFor();
  const tx = await client.get_protection({
    anchor_withdrawal_id: Buffer.from(anchorWithdrawalId),
  });
  return (tx.result as { unwrap(): unknown }).unwrap();
}

export async function getDomainId(): Promise<Buffer> {
  const client = await clientFor();
  const tx = await client.domain_id();
  return Buffer.from(tx.result as Uint8Array);
}

/** Guarantee Provider opens a protection — GP's own key signs (require_auth). */
export async function openProtection(
  gpKeypair: Keypair,
  args: {
    guarantee_provider: string;
    anchor_withdrawal_id: Uint8Array;
    anchor_memo: Uint8Array;
    user: string;
    collateral_amount: bigint;
    funding_duration: bigint;
    sla_duration: bigint;
    grace_duration: bigint;
  },
) {
  const client = await clientFor(gpKeypair);
  const tx = await client.open_protection({
    guarantee_provider: args.guarantee_provider,
    anchor_withdrawal_id: Buffer.from(args.anchor_withdrawal_id),
    anchor_memo: Buffer.from(args.anchor_memo),
    user: args.user,
    collateral_amount: args.collateral_amount,
    funding_duration: args.funding_duration,
    sla_duration: args.sla_duration,
    grace_duration: args.grace_duration,
  });
  const sent = await tx.signAndSend();
  return sent;
}

/** Relayer submits — relayer's key pays fees/signs the tx; it never signs the
 * attestation itself (that's the attestor's Ed25519 key, Bölüm 6). */
export async function submitAttestation(
  relayerKeypair: Keypair,
  payload: {
    anchor_withdrawal_id: Uint8Array;
    user: string;
    amount: bigint;
    asset: string;
    status: { tag: "Funded" | "Settled" | "Failed" | "Refunded"; values: undefined };
    timestamp: bigint;
    nonce: Uint8Array;
    domain_id: Uint8Array;
  },
  signature: Uint8Array,
) {
  const client = await clientFor(relayerKeypair);
  const tx = await client.submit_attestation({
    payload: {
      anchor_withdrawal_id: Buffer.from(payload.anchor_withdrawal_id),
      user: payload.user,
      amount: payload.amount,
      asset: payload.asset,
      status: payload.status,
      timestamp: payload.timestamp,
      nonce: Buffer.from(payload.nonce),
      domain_id: Buffer.from(payload.domain_id),
    },
    signature: Buffer.from(signature),
  });
  const sent = await tx.signAndSend();
  return sent;
}

export async function expireUnfunded(callerKeypair: Keypair, anchorWithdrawalId: Uint8Array) {
  const client = await clientFor(callerKeypair);
  const tx = await client.expire_unfunded({ anchor_withdrawal_id: Buffer.from(anchorWithdrawalId) });
  return tx.signAndSend();
}

export async function advanceToGrace(callerKeypair: Keypair, anchorWithdrawalId: Uint8Array) {
  const client = await clientFor(callerKeypair);
  const tx = await client.advance_to_grace({ anchor_withdrawal_id: Buffer.from(anchorWithdrawalId) });
  return tx.signAndSend();
}

export async function advanceToClaimable(callerKeypair: Keypair, anchorWithdrawalId: Uint8Array) {
  const client = await clientFor(callerKeypair);
  const tx = await client.advance_to_claimable({ anchor_withdrawal_id: Buffer.from(anchorWithdrawalId) });
  return tx.signAndSend();
}

export async function claim(callerKeypair: Keypair, anchorWithdrawalId: Uint8Array) {
  const client = await clientFor(callerKeypair);
  const tx = await client.claim({ anchor_withdrawal_id: Buffer.from(anchorWithdrawalId) });
  return tx.signAndSend();
}
