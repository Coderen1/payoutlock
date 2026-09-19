use soroban_sdk::{contracttype, xdr::ToXdr, Address, Bytes, BytesN, Env};

use crate::state::AttestationStatus;

/// The signed payload. The signature itself is a separate parameter on
/// `submit_attestation`, never a field of this struct (Architecture-locked
/// decision: signature must not be part of what it signs).
#[contracttype]
#[derive(Clone, Debug)]
pub struct AttestationPayload {
    pub anchor_withdrawal_id: Bytes,
    pub user: Address,
    pub amount: i128,
    pub asset: Address,
    pub status: AttestationStatus,
    pub timestamp: u64,
    pub nonce: BytesN<32>,
    pub domain_id: BytesN<32>,
}

/// Domain separation value: sha256(network_id || contract_address_xdr).
/// Derived entirely from the ledger and the contract's own identity — no
/// separate bootstrap step, matching Architecture's locked `domain_id`
/// definition (deployment + network identity).
pub fn compute_domain_id(env: &Env) -> BytesN<32> {
    let network_id: BytesN<32> = env.ledger().network_id();
    let contract_address: Address = env.current_contract_address();

    let mut buf = Bytes::from_array(env, &network_id.to_array());
    buf.append(&contract_address.to_xdr(env));

    env.crypto().sha256(&buf).into()
}
