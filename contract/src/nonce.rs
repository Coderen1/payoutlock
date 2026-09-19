use soroban_sdk::{BytesN, Env};

use crate::state::DataKey;

/// Read-only check — called BEFORE signature verification. Never writes.
pub fn is_used(env: &Env, nonce: &BytesN<32>) -> bool {
    env.storage().persistent().has(&DataKey::Nonce(nonce.clone()))
}

/// Marks a nonce as consumed. Callers must only invoke this AFTER a valid
/// signature has been verified — an invalid signature must never reach this
/// function (Architecture-locked: nonce burn requires a valid signature).
pub fn consume(env: &Env, nonce: &BytesN<32>) {
    env.storage()
        .persistent()
        .set(&DataKey::Nonce(nonce.clone()), &true);
}
