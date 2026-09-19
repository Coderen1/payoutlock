use soroban_sdk::{contracttype, Address, Bytes, BytesN};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProtectionState {
    AwaitingFunding,
    Pending,
    Grace,
    Claimable,
    Settled,
    Refunded,
    Claimed,
    Expired,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AttestationStatus {
    Funded,
    Settled,
    Failed,
    Refunded,
}

/// Mirrors `AttestationStatus` for the three settlement-side outcomes, plus
/// an explicit `None` variant. Used instead of `Option<AttestationStatus>`:
/// soroban-sdk 28's `#[contracttype]` derive only generates a *fallible*
/// `TryFrom<Self> for ScVal` for custom enums, while `Option<T>`'s ScVal
/// conversion (used when a struct containing it is XDR-encoded) requires an
/// *infallible* `Into<ScVal>` on `T` — so `Option<AttestationStatus>` does
/// not compile as a struct field in this SDK version. An explicit sentinel
/// variant sidesteps the gap entirely.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LastAttestedStatus {
    None,
    Settled,
    Failed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProtectionRecord {
    pub anchor_withdrawal_id: Bytes,
    pub anchor_memo: Bytes,
    pub user: Address,
    pub guarantee_provider: Address,
    pub collateral_amount: i128,
    pub created_at: u64,
    pub funding_duration: u64,
    pub sla_duration: u64,
    pub grace_duration: u64,
    pub funding_deadline: u64,
    pub funded_at: Option<u64>,
    pub sla_deadline: Option<u64>,
    pub grace_deadline: Option<u64>,
    pub state: ProtectionState,
    pub last_attested_status: LastAttestedStatus,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    AttestorPubkey,
    UsdcTokenAddress,
    Protection(Bytes),
    Nonce(BytesN<32>),
}
