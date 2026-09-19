import { Address, Keypair } from "@stellar/stellar-sdk";
import { config } from "./config.ts";
import { attestationPayloadType, loadSpec } from "./contractSpec.ts";

export type AttestationStatus = "Funded" | "Settled" | "Failed" | "Refunded";

export interface AttestationPayload {
  anchorWithdrawalId: Uint8Array;
  user: string; // G-address
  amount: bigint;
  asset: string; // G/C-address
  status: AttestationStatus;
  timestamp: bigint;
  nonce: Uint8Array; // 32 bytes
  domainId: Uint8Array; // 32 bytes
}

/**
 * Builds the exact same ScVal::Map the Rust `#[contracttype]` derive
 * produces for `AttestationPayload` (field order taken from the contract's
 * own on-chain spec, not re-derived by hand — see contractSpec.ts), then
 * XDR-encodes it. This is byte-for-byte what `payload.clone().to_xdr(&env)`
 * produces in the contract, which is what must be signed/verified.
 */
export function encodePayload(payload: AttestationPayload): Buffer {
  const spec = loadSpec();
  const native = {
    anchor_withdrawal_id: Buffer.from(payload.anchorWithdrawalId),
    user: new Address(payload.user),
    amount: payload.amount,
    asset: new Address(payload.asset),
    status: { tag: payload.status, values: undefined },
    timestamp: payload.timestamp,
    nonce: Buffer.from(payload.nonce),
    domain_id: Buffer.from(payload.domainId),
  };
  const scVal = spec.nativeToScVal(native, attestationPayloadType());
  return Buffer.from(scVal.toXDR());
}

export interface SignedAttestation {
  payload: AttestationPayload;
  encodedBytes: Buffer;
  signature: Buffer;
}

/** Signs the canonical encoding directly (no manual pre-hash — Ed25519
 * already hashes internally; matches `env.crypto().ed25519_verify`, which
 * verifies over the raw message bytes, not a pre-hashed digest). */
export function signPayload(payload: AttestationPayload): SignedAttestation {
  const encodedBytes = encodePayload(payload);
  const attestorKeypair = Keypair.fromSecret(config.attestorSecret);
  const signature = Buffer.from(attestorKeypair.sign(encodedBytes));
  return { payload, encodedBytes, signature };
}

export function attestorPublicKeyHex(): string {
  const kp = Keypair.fromSecret(config.attestorSecret);
  return Buffer.from(kp.rawPublicKey()).toString("hex");
}
