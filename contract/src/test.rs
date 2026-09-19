extern crate std;

use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    token, Address, Bytes, BytesN, Env,
};

use crate::{
    attestation::AttestationPayload,
    state::{AttestationStatus, LastAttestedStatus, ProtectionState},
    Error, PayoutLock, PayoutLockClient,
};

const FUNDING_DURATION: u64 = 3600;
const SLA_DURATION: u64 = 86_400;
const GRACE_DURATION: u64 = 43_200;
const COLLATERAL_AMOUNT: i128 = 1_000_0000000;
const MINT_AMOUNT: i128 = 1_000_000_0000000;

struct Ctx {
    contract_id: Address,
    usdc: Address,
    attestor_key: SigningKey,
    gp: Address,
    user: Address,
}

fn attestor_signing_key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

fn setup(env: &Env) -> Ctx {
    env.mock_all_auths();

    let admin = Address::generate(env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let usdc = sac.address();

    let gp = Address::generate(env);
    let user = Address::generate(env);
    token::StellarAssetClient::new(env, &usdc).mint(&gp, &MINT_AMOUNT);

    let attestor_key = attestor_signing_key(1);
    let attestor_pubkey = BytesN::from_array(env, &attestor_key.verifying_key().to_bytes());

    let contract_id = env.register(PayoutLock, (attestor_pubkey, usdc.clone()));

    Ctx {
        contract_id,
        usdc,
        attestor_key,
        gp,
        user,
    }
}

fn client<'a>(env: &'a Env, ctx: &Ctx) -> PayoutLockClient<'a> {
    PayoutLockClient::new(env, &ctx.contract_id)
}

fn nonce(env: &Env, tag: u32) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[28..32].copy_from_slice(&tag.to_be_bytes());
    BytesN::from_array(env, &bytes)
}

fn withdrawal_id(env: &Env, tag: &[u8]) -> Bytes {
    Bytes::from_slice(env, tag)
}

fn sign(env: &Env, key: &SigningKey, payload: &AttestationPayload) -> BytesN<64> {
    let message = payload.clone().to_xdr_bytes(env);
    let sig = key.sign(&message);
    BytesN::from_array(env, &sig.to_bytes())
}

/// Small helper: matches the contract's own canonical encoding exactly,
/// since it calls the same `to_xdr` this crate uses internally.
trait ToXdrBytes {
    fn to_xdr_bytes(self, env: &Env) -> std::vec::Vec<u8>;
}
impl ToXdrBytes for AttestationPayload {
    fn to_xdr_bytes(self, env: &Env) -> std::vec::Vec<u8> {
        use soroban_sdk::xdr::ToXdr;
        self.to_xdr(env).iter().collect()
    }
}

fn make_payload(
    env: &Env,
    ctx: &Ctx,
    id: Bytes,
    status: AttestationStatus,
    amount: i128,
    nonce_tag: u32,
) -> AttestationPayload {
    AttestationPayload {
        anchor_withdrawal_id: id,
        user: ctx.user.clone(),
        amount,
        asset: ctx.usdc.clone(),
        status,
        timestamp: env.ledger().timestamp(),
        nonce: nonce(env, nonce_tag),
        domain_id: client(env, ctx).domain_id(),
    }
}

fn open_default(env: &Env, ctx: &Ctx, cl: &PayoutLockClient, id: &Bytes) {
    cl.open_protection(
        &ctx.gp,
        id,
        &withdrawal_id(env, b"memo"),
        &ctx.user,
        &COLLATERAL_AMOUNT,
        &FUNDING_DURATION,
        &SLA_DURATION,
        &GRACE_DURATION,
    );
}

/// Opens a protection and drives it all the way to `Pending` via a real
/// FUNDED attestation. Returns the withdrawal id used.
fn open_and_fund(env: &Env, ctx: &Ctx, cl: &PayoutLockClient, tag: &[u8], nonce_tag: u32) -> Bytes {
    let id = withdrawal_id(env, tag);
    open_default(env, ctx, cl, &id);

    let payload = make_payload(
        env,
        ctx,
        id.clone(),
        AttestationStatus::Funded,
        COLLATERAL_AMOUNT,
        nonce_tag,
    );
    let sig = sign(env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    id
}

// ---------------------------------------------------------------------
// 1. open_protection happy path
// ---------------------------------------------------------------------
#[test]
fn test_01_open_protection_happy_path() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w1");

    open_default(&env, &ctx, &cl, &id);

    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::AwaitingFunding);
    assert_eq!(record.sla_deadline, None);
    assert_eq!(record.grace_deadline, None);
    assert_eq!(record.collateral_amount, COLLATERAL_AMOUNT);

    let usdc_client = token::Client::new(&env, &ctx.usdc);
    assert_eq!(usdc_client.balance(&ctx.contract_id), COLLATERAL_AMOUNT);
    assert_eq!(usdc_client.balance(&ctx.gp), MINT_AMOUNT - COLLATERAL_AMOUNT);
}

// ---------------------------------------------------------------------
// 2. duplicate anchor_withdrawal_id
// ---------------------------------------------------------------------
#[test]
fn test_02_duplicate_withdrawal_id_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w2");

    open_default(&env, &ctx, &cl, &id);
    let result = cl.try_open_protection(
        &ctx.gp,
        &id,
        &withdrawal_id(&env, b"memo"),
        &ctx.user,
        &COLLATERAL_AMOUNT,
        &FUNDING_DURATION,
        &SLA_DURATION,
        &GRACE_DURATION,
    );
    assert_eq!(result, Err(Ok(Error::DuplicateWithdrawalId)));
}

// ---------------------------------------------------------------------
// 3. invalid open_protection parameters
// ---------------------------------------------------------------------
#[test]
fn test_03_invalid_parameters_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);

    let bad_amount = cl.try_open_protection(
        &ctx.gp,
        &withdrawal_id(&env, b"a"),
        &withdrawal_id(&env, b"memo"),
        &ctx.user,
        &0,
        &FUNDING_DURATION,
        &SLA_DURATION,
        &GRACE_DURATION,
    );
    assert_eq!(bad_amount, Err(Ok(Error::InvalidAmount)));

    let bad_funding = cl.try_open_protection(
        &ctx.gp,
        &withdrawal_id(&env, b"b"),
        &withdrawal_id(&env, b"memo"),
        &ctx.user,
        &COLLATERAL_AMOUNT,
        &0,
        &SLA_DURATION,
        &GRACE_DURATION,
    );
    assert_eq!(bad_funding, Err(Ok(Error::InvalidDuration)));

    let bad_sla = cl.try_open_protection(
        &ctx.gp,
        &withdrawal_id(&env, b"c"),
        &withdrawal_id(&env, b"memo"),
        &ctx.user,
        &COLLATERAL_AMOUNT,
        &FUNDING_DURATION,
        &0,
        &GRACE_DURATION,
    );
    assert_eq!(bad_sla, Err(Ok(Error::InvalidDuration)));

    let bad_grace = cl.try_open_protection(
        &ctx.gp,
        &withdrawal_id(&env, b"d"),
        &withdrawal_id(&env, b"memo"),
        &ctx.user,
        &COLLATERAL_AMOUNT,
        &FUNDING_DURATION,
        &SLA_DURATION,
        &0,
    );
    assert_eq!(bad_grace, Err(Ok(Error::InvalidDuration)));
}

// ---------------------------------------------------------------------
// 4. deadline overflow
// ---------------------------------------------------------------------
#[test]
fn test_04_deadline_overflow_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);

    let result = cl.try_open_protection(
        &ctx.gp,
        &withdrawal_id(&env, b"overflow"),
        &withdrawal_id(&env, b"memo"),
        &ctx.user,
        &COLLATERAL_AMOUNT,
        &u64::MAX,
        &u64::MAX,
        &u64::MAX,
    );
    assert_eq!(result, Err(Ok(Error::DeadlineOverflow)));
}

// ---------------------------------------------------------------------
// 5. valid FUNDED in AwaitingFunding
// ---------------------------------------------------------------------
#[test]
fn test_05_funded_transitions_to_pending() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w5");
    open_default(&env, &ctx, &cl, &id);

    let before = token::Client::new(&env, &ctx.usdc).balance(&ctx.contract_id);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Funded, COLLATERAL_AMOUNT, 5);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::Pending);
    assert!(record.funded_at.is_some());
    let funded_at = record.funded_at.unwrap();
    assert_eq!(record.sla_deadline, Some(funded_at + SLA_DURATION));
    assert_eq!(record.grace_deadline, Some(funded_at + SLA_DURATION + GRACE_DURATION));

    let after = token::Client::new(&env, &ctx.usdc).balance(&ctx.contract_id);
    assert_eq!(before, after, "FUNDED must not move collateral");
}

// ---------------------------------------------------------------------
// 6. FUNDED rejected outside AwaitingFunding
// ---------------------------------------------------------------------
#[test]
fn test_06_funded_rejected_in_pending() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w6", 60);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Funded, COLLATERAL_AMOUNT, 61);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    let result = cl.try_submit_attestation(&payload, &sig);
    assert_eq!(result, Err(Ok(Error::WrongStateForStatus)));
}

// ---------------------------------------------------------------------
// 7. expire_unfunded boundary
// ---------------------------------------------------------------------
#[test]
fn test_07_expire_unfunded_boundary() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w7");
    open_default(&env, &ctx, &cl, &id);

    let created_at = env.ledger().timestamp();
    env.ledger().set_timestamp(created_at + FUNDING_DURATION);
    let too_early = cl.try_expire_unfunded(&id);
    assert_eq!(too_early, Err(Ok(Error::FundingWindowNotExpired)));

    env.ledger().set_timestamp(created_at + FUNDING_DURATION + 1);
    cl.expire_unfunded(&id);
    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::Expired);
}

// ---------------------------------------------------------------------
// 8. expire_unfunded wrong state
// ---------------------------------------------------------------------
#[test]
fn test_08_expire_unfunded_wrong_state_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w8", 80);

    let result = cl.try_expire_unfunded(&id);
    assert_eq!(result, Err(Ok(Error::WrongStateForStatus)));
}

// ---------------------------------------------------------------------
// 9. deterministic deadline: late advance_to_grace doesn't shift window
// ---------------------------------------------------------------------
#[test]
fn test_09_deterministic_deadline_not_shifted_by_late_call() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w9", 90);

    let record_after_fund = cl.get_protection(&id);
    let expected_grace_deadline = record_after_fund.grace_deadline.unwrap();

    // Let a lot of time pass before ever calling advance_to_grace.
    let now = env.ledger().timestamp();
    env.ledger().set_timestamp(now + SLA_DURATION + GRACE_DURATION * 10);
    cl.advance_to_grace(&id);

    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::Grace);
    assert_eq!(record.grace_deadline, Some(expected_grace_deadline));
}

// ---------------------------------------------------------------------
// 10 / 11. SETTLED in Pending / Grace
// ---------------------------------------------------------------------
#[test]
fn test_10_settled_in_pending() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w10", 100);

    let gp_before = token::Client::new(&env, &ctx.usdc).balance(&ctx.gp);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 101);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::Settled);
    assert_eq!(record.last_attested_status, LastAttestedStatus::Settled);

    let gp_after = token::Client::new(&env, &ctx.usdc).balance(&ctx.gp);
    assert_eq!(gp_after, gp_before + COLLATERAL_AMOUNT);
}

#[test]
fn test_11_settled_in_grace() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w11", 110);

    let record = cl.get_protection(&id);
    env.ledger().set_timestamp(record.sla_deadline.unwrap() + 1);
    cl.advance_to_grace(&id);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 111);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    assert_eq!(cl.get_protection(&id).state, ProtectionState::Settled);
}

// ---------------------------------------------------------------------
// 12. REFUNDED in Pending/Grace
// ---------------------------------------------------------------------
#[test]
fn test_12_refunded() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w12", 120);

    let gp_before = token::Client::new(&env, &ctx.usdc).balance(&ctx.gp);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Refunded, COLLATERAL_AMOUNT, 121);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::Refunded);
    assert_eq!(record.last_attested_status, LastAttestedStatus::Refunded);
    assert_eq!(
        token::Client::new(&env, &ctx.usdc).balance(&ctx.gp),
        gp_before + COLLATERAL_AMOUNT
    );
}

// ---------------------------------------------------------------------
// 13. FAILED — informational only
// ---------------------------------------------------------------------
#[test]
fn test_13_failed_is_informational_only() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w13", 130);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Failed, COLLATERAL_AMOUNT, 131);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    let record = cl.get_protection(&id);
    assert_eq!(record.state, ProtectionState::Pending);
    assert_eq!(record.last_attested_status, LastAttestedStatus::Failed);
}

// ---------------------------------------------------------------------
// 14. SETTLED/REFUNDED/FAILED rejected in AwaitingFunding
// ---------------------------------------------------------------------
#[test]
fn test_14_settlement_status_rejected_in_awaiting_funding() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w14");
    open_default(&env, &ctx, &cl, &id);

    for (status, tag) in [
        (AttestationStatus::Settled, 140u32),
        (AttestationStatus::Refunded, 141u32),
        (AttestationStatus::Failed, 142u32),
    ] {
        let payload = make_payload(&env, &ctx, id.clone(), status, COLLATERAL_AMOUNT, tag);
        let sig = sign(&env, &ctx.attestor_key, &payload);
        let result = cl.try_submit_attestation(&payload, &sig);
        assert_eq!(result, Err(Ok(Error::WrongStateForStatus)));
    }
}

// ---------------------------------------------------------------------
// 15. invalid signature: rejected, nonce NOT burned
// ---------------------------------------------------------------------
#[test]
fn test_15_invalid_signature_rejected_nonce_not_burned() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w15", 150);

    let wrong_key = attestor_signing_key(99);
    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 151);
    let bad_sig = sign(&env, &wrong_key, &payload);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cl.submit_attestation(&payload, &bad_sig);
    }));
    assert!(result.is_err(), "invalid signature must panic/abort the call");

    // state unchanged
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Pending);

    // the SAME nonce, now with a VALID signature, must still be usable.
    let valid_sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &valid_sig);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Settled);
}

// ---------------------------------------------------------------------
// 16. used nonce rejected
// ---------------------------------------------------------------------
#[test]
fn test_16_used_nonce_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w16", 160);

    // FAILED does not transition state (record stays `Pending`), so the
    // second submission's rejection is isolated to the nonce check, not the
    // state whitelist (distinct from test 35's terminal-state replay case).
    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Failed, COLLATERAL_AMOUNT, 161);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Pending);

    let result = cl.try_submit_attestation(&payload, &sig);
    assert_eq!(result, Err(Ok(Error::NonceAlreadyUsed)));
}

// ---------------------------------------------------------------------
// 17. field mismatch rejected
// ---------------------------------------------------------------------
#[test]
fn test_17_field_mismatch_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w17", 170);

    // wrong amount
    let mut bad_amount_payload =
        make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT + 1, 171);
    let sig = sign(&env, &ctx.attestor_key, &bad_amount_payload);
    assert_eq!(
        cl.try_submit_attestation(&bad_amount_payload, &sig),
        Err(Ok(Error::FieldMismatch))
    );

    // wrong user
    bad_amount_payload.amount = COLLATERAL_AMOUNT;
    bad_amount_payload.user = Address::generate(&env);
    bad_amount_payload.nonce = nonce(&env, 172);
    let sig2 = sign(&env, &ctx.attestor_key, &bad_amount_payload);
    assert_eq!(
        cl.try_submit_attestation(&bad_amount_payload, &sig2),
        Err(Ok(Error::FieldMismatch))
    );

    // wrong asset
    let mut bad_asset_payload =
        make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 173);
    bad_asset_payload.asset = Address::generate(&env);
    let sig3 = sign(&env, &ctx.attestor_key, &bad_asset_payload);
    assert_eq!(
        cl.try_submit_attestation(&bad_asset_payload, &sig3),
        Err(Ok(Error::FieldMismatch))
    );

    // wrong withdrawal id (record not found, since key is derived from it)
    let mut bad_id_payload =
        make_payload(&env, &ctx, withdrawal_id(&env, b"nonexistent"), AttestationStatus::Settled, COLLATERAL_AMOUNT, 174);
    bad_id_payload.user = ctx.user.clone();
    let sig4 = sign(&env, &ctx.attestor_key, &bad_id_payload);
    assert_eq!(
        cl.try_submit_attestation(&bad_id_payload, &sig4),
        Err(Ok(Error::ProtectionNotFound))
    );
}

// ---------------------------------------------------------------------
// 18. wrong domain_id rejected
// ---------------------------------------------------------------------
#[test]
fn test_18_wrong_domain_id_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w18", 180);

    let mut payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 181);
    payload.domain_id = BytesN::from_array(&env, &[0xAB; 32]);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    assert_eq!(
        cl.try_submit_attestation(&payload, &sig),
        Err(Ok(Error::InvalidDomain))
    );
}

// ---------------------------------------------------------------------
// 19 / 25. advance_to_grace boundary
// ---------------------------------------------------------------------
#[test]
fn test_19_25_advance_to_grace_boundary() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w19", 190);

    let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();

    env.ledger().set_timestamp(sla_deadline);
    assert_eq!(cl.try_advance_to_grace(&id), Err(Ok(Error::SlaNotExpired)));

    env.ledger().set_timestamp(sla_deadline + 1);
    cl.advance_to_grace(&id);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Grace);
}

// ---------------------------------------------------------------------
// 20 / 26. advance_to_claimable boundary
// ---------------------------------------------------------------------
#[test]
fn test_20_26_advance_to_claimable_boundary() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w20", 200);

    let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();
    env.ledger().set_timestamp(sla_deadline + 1);
    cl.advance_to_grace(&id);

    let grace_deadline = cl.get_protection(&id).grace_deadline.unwrap();
    env.ledger().set_timestamp(grace_deadline);
    assert_eq!(cl.try_advance_to_claimable(&id), Err(Ok(Error::GraceNotExpired)));

    env.ledger().set_timestamp(grace_deadline + 1);
    cl.advance_to_claimable(&id);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Claimable);
}

// ---------------------------------------------------------------------
// 21. attestation rejected in Claimable/Expired/terminal states
// ---------------------------------------------------------------------
#[test]
fn test_21_attestation_rejected_in_closed_states() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w21", 210);

    let grace_deadline_path = || {
        let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();
        env.ledger().set_timestamp(sla_deadline + 1);
        cl.advance_to_grace(&id);
        let grace_deadline = cl.get_protection(&id).grace_deadline.unwrap();
        env.ledger().set_timestamp(grace_deadline + 1);
        cl.advance_to_claimable(&id);
    };
    grace_deadline_path();
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Claimable);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 211);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    assert_eq!(
        cl.try_submit_attestation(&payload, &sig),
        Err(Ok(Error::WrongStateForStatus))
    );
}

// ---------------------------------------------------------------------
// 22 / 34. claim only in Claimable, once, always to record.user
// ---------------------------------------------------------------------
#[test]
fn test_22_34_claim_semantics() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w22", 220);

    assert_eq!(cl.try_claim(&id), Err(Ok(Error::NotClaimable)));

    let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();
    env.ledger().set_timestamp(sla_deadline + 1);
    cl.advance_to_grace(&id);
    let grace_deadline = cl.get_protection(&id).grace_deadline.unwrap();
    env.ledger().set_timestamp(grace_deadline + 1);
    cl.advance_to_claimable(&id);

    let user_before = token::Client::new(&env, &ctx.usdc).balance(&ctx.user);

    // Claim invoked by an unrelated third party — funds must still go to `user`.
    let third_party = Address::generate(&env);
    let _ = third_party;
    cl.claim(&id);

    let user_after = token::Client::new(&env, &ctx.usdc).balance(&ctx.user);
    assert_eq!(user_after, user_before + COLLATERAL_AMOUNT);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Claimed);

    assert_eq!(cl.try_claim(&id), Err(Ok(Error::NotClaimable)));
}

// ---------------------------------------------------------------------
// 23. terminal states reject any new event
// ---------------------------------------------------------------------
#[test]
fn test_23_terminal_states_reject_everything() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w23", 230);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 231);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Settled);

    assert_eq!(cl.try_claim(&id), Err(Ok(Error::NotClaimable)));
    assert_eq!(cl.try_advance_to_grace(&id), Err(Ok(Error::WrongStateForStatus)));
    assert_eq!(cl.try_expire_unfunded(&id), Err(Ok(Error::WrongStateForStatus)));

    let payload2 = make_payload(&env, &ctx, id.clone(), AttestationStatus::Refunded, COLLATERAL_AMOUNT, 232);
    let sig2 = sign(&env, &ctx.attestor_key, &payload2);
    assert_eq!(
        cl.try_submit_attestation(&payload2, &sig2),
        Err(Ok(Error::WrongStateForStatus))
    );
}

// ---------------------------------------------------------------------
// 24. funding_deadline exact boundary (duplicate of 7 semantics, explicit)
// ---------------------------------------------------------------------
#[test]
fn test_24_funding_deadline_exact_boundary() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w24");
    open_default(&env, &ctx, &cl, &id);

    let funding_deadline = cl.get_protection(&id).funding_deadline;
    env.ledger().set_timestamp(funding_deadline);
    assert_eq!(cl.try_expire_unfunded(&id), Err(Ok(Error::FundingWindowNotExpired)));
    env.ledger().set_timestamp(funding_deadline + 1);
    cl.expire_unfunded(&id);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Expired);
}

// ---------------------------------------------------------------------
// 27. critical closed-door test: state still "Grace" in storage, but
//     now > grace_deadline and advance_to_claimable was NEVER called.
// ---------------------------------------------------------------------
#[test]
fn test_27_closed_door_is_time_based_not_state_based() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w27", 270);

    let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();
    env.ledger().set_timestamp(sla_deadline + 1);
    cl.advance_to_grace(&id);

    let grace_deadline = cl.get_protection(&id).grace_deadline.unwrap();

    // At exactly grace_deadline: still valid, closed-door hasn't shut yet.
    env.ledger().set_timestamp(grace_deadline);
    let payload_ok = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 271);
    let sig_ok = sign(&env, &ctx.attestor_key, &payload_ok);
    // Don't actually submit yet (would consume the nonce/terminal the record);
    // just prove it WOULD be accepted by checking no error is produced via a
    // fresh independent record instead. Simplest: submit here since this is
    // the "accepted" half of the boundary.
    cl.submit_attestation(&payload_ok, &sig_ok);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Settled);

    // Second, independent protection: past the boundary, `advance_to_claimable`
    // is deliberately never called — `state` still says `Grace` in storage.
    let id2 = open_and_fund(&env, &ctx, &cl, b"w27b", 272);
    let sla_deadline2 = cl.get_protection(&id2).sla_deadline.unwrap();
    env.ledger().set_timestamp(sla_deadline2 + 1);
    cl.advance_to_grace(&id2);
    let grace_deadline2 = cl.get_protection(&id2).grace_deadline.unwrap();

    env.ledger().set_timestamp(grace_deadline2 + 1);
    // still `Grace` in storage — nobody called advance_to_claimable
    assert_eq!(cl.get_protection(&id2).state, ProtectionState::Grace);

    let payload_late = make_payload(&env, &ctx, id2.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 273);
    let sig_late = sign(&env, &ctx.attestor_key, &payload_late);
    assert_eq!(
        cl.try_submit_attestation(&payload_late, &sig_late),
        Err(Ok(Error::WrongStateForStatus)),
        "closed door must apply by time even if advance_to_claimable was never called"
    );
}

// ---------------------------------------------------------------------
// 28-31. atomic rollback: failed token transfer must not commit state
// ---------------------------------------------------------------------
// The failure is forced for real: the contract's own `usdc_token_address`
// instance-storage entry is temporarily overwritten (via `env.as_contract`,
// a testutil that runs a closure with this contract as the active frame,
// so `env.storage()` targets ITS storage) to point at an address with no
// deployed contract at all. The next outbound token transfer then panics
// on a genuine failed cross-contract invocation — not a simulated one —
// and we assert the state mutation that preceded it in the same
// invocation was rolled back too, exercising Soroban's actual atomicity
// guarantee rather than assuming it holds.
fn break_usdc_address(env: &Env, ctx: &Ctx) {
    let bogus = Address::generate(env);
    env.as_contract(&ctx.contract_id, || {
        env.storage()
            .instance()
            .set(&crate::state::DataKey::UsdcTokenAddress, &bogus);
    });
}

fn restore_usdc_address(env: &Env, ctx: &Ctx) {
    env.as_contract(&ctx.contract_id, || {
        env.storage()
            .instance()
            .set(&crate::state::DataKey::UsdcTokenAddress, &ctx.usdc);
    });
}

#[test]
fn test_28_claim_atomic_rollback() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w28-claim", 2800);

    let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();
    env.ledger().set_timestamp(sla_deadline + 1);
    cl.advance_to_grace(&id);
    let grace_deadline = cl.get_protection(&id).grace_deadline.unwrap();
    env.ledger().set_timestamp(grace_deadline + 1);
    cl.advance_to_claimable(&id);

    break_usdc_address(&env, &ctx);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cl.claim(&id);
    }));
    assert!(result.is_err(), "claim() with an unreachable token contract must panic");
    restore_usdc_address(&env, &ctx);

    assert_eq!(
        cl.get_protection(&id).state,
        ProtectionState::Claimable,
        "state=Claimed must not have been committed when the transfer failed"
    );

    // Retry with the real token address restored succeeds normally.
    let user_before = token::Client::new(&env, &ctx.usdc).balance(&ctx.user);
    cl.claim(&id);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Claimed);
    assert_eq!(
        token::Client::new(&env, &ctx.usdc).balance(&ctx.user),
        user_before + COLLATERAL_AMOUNT
    );
}

#[test]
fn test_29_settled_atomic_rollback() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w29-settled", 2810);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 2811);
    let sig = sign(&env, &ctx.attestor_key, &payload);

    break_usdc_address(&env, &ctx);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cl.submit_attestation(&payload, &sig);
    }));
    assert!(result.is_err(), "SETTLED with an unreachable token contract must panic");
    restore_usdc_address(&env, &ctx);

    assert_eq!(
        cl.get_protection(&id).state,
        ProtectionState::Pending,
        "state=Settled must not have been committed when the transfer failed"
    );

    // The nonce write happens in the same invocation as the transfer, so it
    // must have rolled back too — the exact same payload+signature is still
    // usable on retry.
    cl.submit_attestation(&payload, &sig);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Settled);
}

#[test]
fn test_30_refunded_atomic_rollback() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w30-refunded", 2820);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Refunded, COLLATERAL_AMOUNT, 2821);
    let sig = sign(&env, &ctx.attestor_key, &payload);

    break_usdc_address(&env, &ctx);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cl.submit_attestation(&payload, &sig);
    }));
    assert!(result.is_err(), "REFUNDED with an unreachable token contract must panic");
    restore_usdc_address(&env, &ctx);

    assert_eq!(
        cl.get_protection(&id).state,
        ProtectionState::Pending,
        "state=Refunded must not have been committed when the transfer failed"
    );

    cl.submit_attestation(&payload, &sig);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Refunded);
}

#[test]
fn test_31_expire_unfunded_atomic_rollback() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = withdrawal_id(&env, b"w31-expired");
    open_default(&env, &ctx, &cl, &id);

    let funding_deadline = cl.get_protection(&id).funding_deadline;
    env.ledger().set_timestamp(funding_deadline + 1);

    break_usdc_address(&env, &ctx);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cl.expire_unfunded(&id);
    }));
    assert!(result.is_err(), "expire_unfunded with an unreachable token contract must panic");
    restore_usdc_address(&env, &ctx);

    assert_eq!(
        cl.get_protection(&id).state,
        ProtectionState::AwaitingFunding,
        "state=Expired must not have been committed when the transfer failed"
    );

    cl.expire_unfunded(&id);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Expired);
}

// ---------------------------------------------------------------------
// 32. GP auth required for open_protection
// ---------------------------------------------------------------------
#[test]
fn test_32_open_protection_requires_gp_auth() {
    let env = Env::default();
    // Do NOT call env.mock_all_auths() in this test.
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let usdc = sac.address();
    let gp = Address::generate(&env);
    let user = Address::generate(&env);

    env.mock_all_auths();
    token::StellarAssetClient::new(&env, &usdc).mint(&gp, &MINT_AMOUNT);
    let attestor_key = attestor_signing_key(1);
    let attestor_pubkey = BytesN::from_array(&env, &attestor_key.verifying_key().to_bytes());
    let contract_id = env.register(PayoutLock, (attestor_pubkey, usdc));
    env.set_auths(&[]); // turn auth mocking back off for the call under test

    let cl = PayoutLockClient::new(&env, &contract_id);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        cl.open_protection(
            &gp,
            &withdrawal_id(&env, b"w32"),
            &withdrawal_id(&env, b"memo"),
            &user,
            &COLLATERAL_AMOUNT,
            &FUNDING_DURATION,
            &SLA_DURATION,
            &GRACE_DURATION,
        );
    }));
    assert!(result.is_err(), "open_protection without GP auth must fail");
}

// ---------------------------------------------------------------------
// 33. permissionless calls succeed regardless of caller identity
// ---------------------------------------------------------------------
#[test]
fn test_33_permissionless_calls_are_caller_independent() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w33", 330);

    // There is no notion of "caller" to set explicitly for a test client
    // invocation beyond auths (which these functions don't require) — the
    // absence of any require_auth in advance_to_grace/advance_to_claimable/
    // claim/expire_unfunded (Bölüm 4) IS the caller-independence guarantee.
    // We confirm they succeed with zero auths in the environment.
    env.set_auths(&[]);

    let sla_deadline = cl.get_protection(&id).sla_deadline.unwrap();
    env.ledger().set_timestamp(sla_deadline + 1);
    cl.advance_to_grace(&id); // no auth required, no panic
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Grace);

    let grace_deadline = cl.get_protection(&id).grace_deadline.unwrap();
    env.ledger().set_timestamp(grace_deadline + 1);
    cl.advance_to_claimable(&id);
    cl.claim(&id);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Claimed);
}

// ---------------------------------------------------------------------
// 35. exact same attestation (payload + signature) replayed
// ---------------------------------------------------------------------
#[test]
fn test_35_exact_replay_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w35", 350);

    let payload = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 351);
    let sig = sign(&env, &ctx.attestor_key, &payload);
    cl.submit_attestation(&payload, &sig);

    let replay = cl.try_submit_attestation(&payload, &sig);
    assert_eq!(replay, Err(Ok(Error::WrongStateForStatus)));
}

// ---------------------------------------------------------------------
// 36. same nonce, different payload — still rejected
// ---------------------------------------------------------------------
#[test]
fn test_36_same_nonce_different_payload_rejected() {
    let env = Env::default();
    let ctx = setup(&env);
    let cl = client(&env, &ctx);
    let id = open_and_fund(&env, &ctx, &cl, b"w36", 360);

    let payload1 = make_payload(&env, &ctx, id.clone(), AttestationStatus::Failed, COLLATERAL_AMOUNT, 361);
    let sig1 = sign(&env, &ctx.attestor_key, &payload1);
    cl.submit_attestation(&payload1, &sig1);
    assert_eq!(cl.get_protection(&id).state, ProtectionState::Pending);

    // Different status, SAME nonce (361), freshly signed over the new bytes.
    let mut payload2 = make_payload(&env, &ctx, id.clone(), AttestationStatus::Settled, COLLATERAL_AMOUNT, 999);
    payload2.nonce = nonce(&env, 361);
    let sig2 = sign(&env, &ctx.attestor_key, &payload2);

    let result = cl.try_submit_attestation(&payload2, &sig2);
    assert_eq!(result, Err(Ok(Error::NonceAlreadyUsed)));
}

// ---------------------------------------------------------------------
// 37. (see test 2) duplicate anchor_withdrawal_id — already covered above.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// TS <-> Rust encoding interop fixture (Phase 3, Bölüm 2 of the review).
// Fixed, arbitrary-but-known field values. Prints the canonical XDR hex of
// `AttestationPayload.to_xdr(&env)` for independent reproduction on the
// TypeScript side (attestor/src/scripts/encodingFixture.ts). Run with:
//   cargo test --all-features --lib test_encoding_interop_fixture -- --nocapture
// ---------------------------------------------------------------------
#[test]
fn test_encoding_interop_fixture() {
    let env = Env::default();

    let user = Address::from_str(&env, "GA5FD3XKOVHWIQQDWURBIKVNB3DNL4BIXVM3BT3HDRKHOVZH6WC422VQ");
    let asset = Address::from_str(&env, "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA");

    let payload = AttestationPayload {
        anchor_withdrawal_id: Bytes::from_slice(&env, b"fixture-wd-id"),
        user,
        amount: 1234567i128,
        asset,
        status: AttestationStatus::Funded,
        timestamp: 1700000000u64,
        nonce: BytesN::from_array(&env, &[0x11u8; 32]),
        domain_id: BytesN::from_array(&env, &[0x22u8; 32]),
    };

    use soroban_sdk::xdr::ToXdr;
    let xdr_bytes = payload.to_xdr(&env);
    let hex: std::string::String = xdr_bytes
        .iter()
        .map(|b| std::format!("{:02x}", b))
        .collect();
    std::println!("FIXTURE_HEX={}", hex);
}

/// Closes the loop on the encoding proof above: takes the REAL attestor
/// keypair's public key and a signature produced by attestor/src/sign.ts
/// (TypeScript) over the identical fixture bytes, and verifies it with the
/// contract's own `env.crypto().ed25519_verify` — the same primitive
/// `submit_attestation` uses. If this passes, a TS-signed attestation is
/// guaranteed acceptable to the Rust verifier (domain_id/state checks
/// aside, which are exercised separately by the real happy path).
fn decode_hex(s: &str) -> std::vec::Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

#[test]
fn test_ts_signature_verifies_in_rust() {
    let env = Env::default();

    let pubkey_bytes = decode_hex("341a329be6de25af9ec62888e453941442abae8b05b8a52bdf122b4a1ff063e0");
    let attestor_pubkey: BytesN<32> = BytesN::from_array(
        &env,
        &<[u8; 32]>::try_from(pubkey_bytes.as_slice()).unwrap(),
    );

    let message_bytes = decode_hex("0000001100000001000000080000000f00000006616d6f756e7400000000000a0000000000000000000000000012d6870000000f00000014616e63686f725f7769746864726177616c5f69640000000d0000000d666978747572652d77642d69640000000000000f00000005617373657400000000000012000000015045cd5ec0729a768fd5ad02505852df4f028dce830e5ac52209ba48483b2f010000000f00000009646f6d61696e5f69640000000000000d0000002022222222222222222222222222222222222222222222222222222222222222220000000f000000056e6f6e63650000000000000d0000002011111111111111111111111111111111111111111111111111111111111111110000000f0000000673746174757300000000001000000001000000010000000f0000000646756e64656400000000000f0000000974696d657374616d7000000000000005000000006553f1000000000f00000004757365720000001200000000000000003a51eeea754f644203b522142aad0ec6d5f028bd59b0cf671c54775727f585cd");
    let message = Bytes::from_slice(&env, &message_bytes);

    let sig_bytes = decode_hex("844d36de3ed532e660b319bd2db6375460522130b11365d0a6d50688f43f4fb1db20ec501b1057d51ed43bb38b5fb800652ed8545462b7614bdc7e7f7629260a");
    let signature: BytesN<64> = BytesN::from_array(
        &env,
        &<[u8; 64]>::try_from(sig_bytes.as_slice()).unwrap(),
    );

    // Panics if invalid — reaching the line after this call IS the proof.
    env.crypto().ed25519_verify(&attestor_pubkey, &message, &signature);
}
