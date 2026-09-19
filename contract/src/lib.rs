#![no_std]

mod attestation;
mod nonce;
mod state;

#[cfg(test)]
extern crate std;
#[cfg(test)]
mod test;

pub use attestation::AttestationPayload;
pub use state::{AttestationStatus, LastAttestedStatus, ProtectionRecord, ProtectionState};

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, token::TokenClient, xdr::ToXdr, Address,
    Bytes, BytesN, Env, MuxedAddress,
};
use state::DataKey;

/// Rejection reasons. `ed25519_verify` itself panics (not a typed Result) on
/// an invalid signature — see README note in `submit_attestation` below —
/// so there is deliberately no `InvalidSignature` variant here: it can never
/// be constructed.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    InvalidDuration = 2,
    DeadlineOverflow = 3,
    DuplicateWithdrawalId = 4,
    ProtectionNotFound = 5,
    WrongStateForStatus = 6,
    NonceAlreadyUsed = 7,
    InvalidDomain = 8,
    FieldMismatch = 9,
    FundingWindowNotExpired = 10,
    SlaNotExpired = 11,
    GraceNotExpired = 12,
    NotClaimable = 13,
}

/// Discovery signal only — never source of truth. Attestor's `eventWatcher`
/// must always confirm via `get_protection` after seeing this (Architecture
/// §08 / implementation plan Bölüm 8).
#[contractevent]
pub struct ProtectionOpened {
    pub anchor_withdrawal_id: Bytes,
}

#[contract]
pub struct PayoutLock;

#[contractimpl]
impl PayoutLock {
    /// Deploy-time constructor. No public `initialize()` exists — this
    /// eliminates the front-running risk of a separate bootstrap call.
    pub fn __constructor(env: Env, attestor_pubkey: BytesN<32>, usdc_token_address: Address) {
        env.storage()
            .instance()
            .set(&DataKey::AttestorPubkey, &attestor_pubkey);
        env.storage()
            .instance()
            .set(&DataKey::UsdcTokenAddress, &usdc_token_address);
    }

    /// Opens a protection in `AwaitingFunding` (never directly `Pending`).
    /// Collateral is locked immediately; the SLA clock does not start until
    /// a valid FUNDED attestation is accepted (Bölüm 3 revision — closes the
    /// "claim without ever funding" gap).
    pub fn open_protection(
        env: Env,
        guarantee_provider: Address,
        anchor_withdrawal_id: Bytes,
        anchor_memo: Bytes,
        user: Address,
        collateral_amount: i128,
        funding_duration: u64,
        sla_duration: u64,
        grace_duration: u64,
    ) -> Result<Bytes, Error> {
        guarantee_provider.require_auth();

        if collateral_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if funding_duration == 0 || sla_duration == 0 || grace_duration == 0 {
            return Err(Error::InvalidDuration);
        }

        let key = DataKey::Protection(anchor_withdrawal_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::DuplicateWithdrawalId);
        }

        let now = env.ledger().timestamp();
        let funding_deadline = now.checked_add(funding_duration).ok_or(Error::DeadlineOverflow)?;
        // Conservative upfront check: the worst-case chain (funding arrives at
        // the last possible instant, then sla + grace run their full course)
        // must not overflow u64. This guarantees the later FUNDED-time
        // computation in `submit_attestation` can never overflow either.
        funding_deadline
            .checked_add(sla_duration)
            .and_then(|v| v.checked_add(grace_duration))
            .ok_or(Error::DeadlineOverflow)?;

        let usdc: Address = env.storage().instance().get(&DataKey::UsdcTokenAddress).unwrap();
        TokenClient::new(&env, &usdc).transfer(
            &guarantee_provider,
            &MuxedAddress::from(env.current_contract_address()),
            &collateral_amount,
        );

        let record = ProtectionRecord {
            anchor_withdrawal_id: anchor_withdrawal_id.clone(),
            anchor_memo,
            user,
            guarantee_provider,
            collateral_amount,
            created_at: now,
            funding_duration,
            sla_duration,
            grace_duration,
            funding_deadline,
            funded_at: None,
            sla_deadline: None,
            grace_deadline: None,
            state: ProtectionState::AwaitingFunding,
            last_attested_status: LastAttestedStatus::None,
        };
        env.storage().persistent().set(&key, &record);

        ProtectionOpened {
            anchor_withdrawal_id: anchor_withdrawal_id.clone(),
        }
        .publish(&env);

        Ok(anchor_withdrawal_id)
    }

    /// Permissionless. Only valid from `AwaitingFunding` once `funding_deadline`
    /// has passed — releases the Guarantee Provider's collateral when the User
    /// never funded.
    pub fn expire_unfunded(env: Env, anchor_withdrawal_id: Bytes) -> Result<(), Error> {
        let key = DataKey::Protection(anchor_withdrawal_id);
        let mut record: ProtectionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ProtectionNotFound)?;

        if record.state != ProtectionState::AwaitingFunding {
            return Err(Error::WrongStateForStatus);
        }
        let now = env.ledger().timestamp();
        if now <= record.funding_deadline {
            return Err(Error::FundingWindowNotExpired);
        }

        record.state = ProtectionState::Expired;
        env.storage().persistent().set(&key, &record);

        let usdc: Address = env.storage().instance().get(&DataKey::UsdcTokenAddress).unwrap();
        TokenClient::new(&env, &usdc).transfer(
            &env.current_contract_address(),
            &MuxedAddress::from(record.guarantee_provider),
            &record.collateral_amount,
        );

        Ok(())
    }

    /// Permissionless. `Pending` -> `Grace` once `sla_deadline` has passed.
    pub fn advance_to_grace(env: Env, anchor_withdrawal_id: Bytes) -> Result<(), Error> {
        let key = DataKey::Protection(anchor_withdrawal_id);
        let mut record: ProtectionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ProtectionNotFound)?;

        if record.state != ProtectionState::Pending {
            return Err(Error::WrongStateForStatus);
        }
        let sla_deadline = record.sla_deadline.ok_or(Error::WrongStateForStatus)?;
        let now = env.ledger().timestamp();
        if now <= sla_deadline {
            return Err(Error::SlaNotExpired);
        }

        record.state = ProtectionState::Grace;
        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Permissionless. `Grace` -> `Claimable` once `grace_deadline` has passed.
    pub fn advance_to_claimable(env: Env, anchor_withdrawal_id: Bytes) -> Result<(), Error> {
        let key = DataKey::Protection(anchor_withdrawal_id);
        let mut record: ProtectionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ProtectionNotFound)?;

        if record.state != ProtectionState::Grace {
            return Err(Error::WrongStateForStatus);
        }
        let grace_deadline = record.grace_deadline.ok_or(Error::WrongStateForStatus)?;
        let now = env.ledger().timestamp();
        if now <= grace_deadline {
            return Err(Error::GraceNotExpired);
        }

        record.state = ProtectionState::Claimable;
        env.storage().persistent().set(&key, &record);
        Ok(())
    }

    /// Permissionless caller — authority is entirely in `signature`, never in
    /// who submits the call. Validation order (Bölüm 3/4, locked):
    ///   1. record exists
    ///   2. state accepts this status (time-gated closed door for Grace)
    ///   3. nonce not used (READ only)
    ///   4. domain_id matches
    ///   5. withdrawal_id/user/amount/asset match the record
    ///   6/7. canonical XDR encode + ed25519 verify (panics on failure —
    ///        this is itself the atomic rejection; nothing below runs)
    ///   8. nonce consumed (WRITE — only now, after a valid signature)
    ///   9. apply the state transition + collateral effect
    pub fn submit_attestation(
        env: Env,
        payload: AttestationPayload,
        signature: BytesN<64>,
    ) -> Result<(), Error> {
        let key = DataKey::Protection(payload.anchor_withdrawal_id.clone());
        let mut record: ProtectionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ProtectionNotFound)?;

        let now = env.ledger().timestamp();

        match payload.status {
            AttestationStatus::Funded => {
                if record.state != ProtectionState::AwaitingFunding {
                    return Err(Error::WrongStateForStatus);
                }
            }
            AttestationStatus::Settled | AttestationStatus::Refunded | AttestationStatus::Failed => {
                let accepted = match record.state {
                    ProtectionState::Pending => true,
                    ProtectionState::Grace => match record.grace_deadline {
                        Some(gd) => now <= gd,
                        None => false,
                    },
                    _ => false,
                };
                if !accepted {
                    return Err(Error::WrongStateForStatus);
                }
            }
        }

        if nonce::is_used(&env, &payload.nonce) {
            return Err(Error::NonceAlreadyUsed);
        }

        let expected_domain = attestation::compute_domain_id(&env);
        if payload.domain_id != expected_domain {
            return Err(Error::InvalidDomain);
        }

        let usdc: Address = env.storage().instance().get(&DataKey::UsdcTokenAddress).unwrap();
        if payload.anchor_withdrawal_id != record.anchor_withdrawal_id
            || payload.user != record.user
            || payload.amount != record.collateral_amount
            || payload.asset != usdc
        {
            return Err(Error::FieldMismatch);
        }

        let attestor_pubkey: BytesN<32> =
            env.storage().instance().get(&DataKey::AttestorPubkey).unwrap();
        let message = payload.clone().to_xdr(&env);
        // Panics (aborts the whole invocation, atomically) if invalid.
        env.crypto()
            .ed25519_verify(&attestor_pubkey, &message, &signature);

        // Only reached if the signature verified.
        nonce::consume(&env, &payload.nonce);

        match payload.status {
            AttestationStatus::Funded => {
                let sla_deadline = now
                    .checked_add(record.sla_duration)
                    .ok_or(Error::DeadlineOverflow)?;
                let grace_deadline = sla_deadline
                    .checked_add(record.grace_duration)
                    .ok_or(Error::DeadlineOverflow)?;
                record.funded_at = Some(now);
                record.sla_deadline = Some(sla_deadline);
                record.grace_deadline = Some(grace_deadline);
                record.state = ProtectionState::Pending;
                env.storage().persistent().set(&key, &record);
            }
            AttestationStatus::Settled => {
                record.state = ProtectionState::Settled;
                record.last_attested_status = LastAttestedStatus::Settled;
                let guarantee_provider = record.guarantee_provider.clone();
                let amount = record.collateral_amount;
                env.storage().persistent().set(&key, &record);
                TokenClient::new(&env, &usdc).transfer(
                    &env.current_contract_address(),
                    &MuxedAddress::from(guarantee_provider),
                    &amount,
                );
            }
            AttestationStatus::Refunded => {
                record.state = ProtectionState::Refunded;
                record.last_attested_status = LastAttestedStatus::Refunded;
                let guarantee_provider = record.guarantee_provider.clone();
                let amount = record.collateral_amount;
                env.storage().persistent().set(&key, &record);
                TokenClient::new(&env, &usdc).transfer(
                    &env.current_contract_address(),
                    &MuxedAddress::from(guarantee_provider),
                    &amount,
                );
            }
            AttestationStatus::Failed => {
                record.last_attested_status = LastAttestedStatus::Failed;
                env.storage().persistent().set(&key, &record);
            }
        }

        Ok(())
    }

    /// Permissionless. Funds always go to the address stored on the record,
    /// never to the caller.
    pub fn claim(env: Env, anchor_withdrawal_id: Bytes) -> Result<(), Error> {
        let key = DataKey::Protection(anchor_withdrawal_id);
        let mut record: ProtectionRecord = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::ProtectionNotFound)?;

        if record.state != ProtectionState::Claimable {
            return Err(Error::NotClaimable);
        }

        record.state = ProtectionState::Claimed;
        let user = record.user.clone();
        let amount = record.collateral_amount;
        env.storage().persistent().set(&key, &record);

        let usdc: Address = env.storage().instance().get(&DataKey::UsdcTokenAddress).unwrap();
        TokenClient::new(&env, &usdc).transfer(&env.current_contract_address(), &MuxedAddress::from(user), &amount);

        Ok(())
    }

    pub fn get_protection(env: Env, anchor_withdrawal_id: Bytes) -> Result<ProtectionRecord, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Protection(anchor_withdrawal_id))
            .ok_or(Error::ProtectionNotFound)
    }

    /// Read-only. `env.current_contract_address()` (part of the domain_id
    /// derivation) only resolves inside an actual contract invocation, so
    /// this getter is the correct way for both tests and the off-chain
    /// Attestor to obtain the exact expected `domain_id` — rather than each
    /// re-deriving the hash formula independently, which would itself be a
    /// cross-implementation correctness risk.
    pub fn domain_id(env: Env) -> BytesN<32> {
        attestation::compute_domain_id(&env)
    }
}
