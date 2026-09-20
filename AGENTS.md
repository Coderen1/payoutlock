# AGENTS.md

## Project

PayoutLock protects the settlement gap between an on-chain USDC payment and an off-chain bank payout using provider-funded collateral on Stellar.

## Architecture

- `contract/` — Soroban smart contract
- `attestor/` — orchestration API, attestor, relayer, keeper
- `web/` — React/Vite frontend
- `docs/` — architecture documentation

## Critical invariants

- User principal never enters the PayoutLock contract.
- Collateral is funded by the protection provider.
- No claim is possible before verified funding.
- Keeper never calls `claim()`.
- Bank truth is not trustless; settlement truth comes from the attestor.
- Do not describe the product as insurance, guaranteed, trustless, or Mainnet-ready.

## Live vs demo

- `/app` = live sandbox-anchor cash-out flow.
- `/app/demo` = simulated fiat failure/refund outcomes.
- Stellar Testnet payments, collateral locking, state transitions, and claims are real.
- Simulated outcomes must always be visibly labelled.
- Do not add "simulate" controls to `/app`.

## Sensitive / proven areas

Before changing these, inspect existing behavior carefully:

- `web/src/lib/`
- `web/src/hooks/`
- wallet / anchor / Soroban flow logic
- contract state-machine semantics

Read `docs/WEB_ARCHITECTURE.md` before frontend architecture or styling changes.

## Testing

Frontend:

- `npm test`
- `npm run flows`
- `npm run landing`

Contract:

- `cargo test`

Attestor:

- `npm test`

During development, run the smallest relevant test set. Before finalizing a behavioral change, run the broader regression relevant to that area.

## Deployment

Frontend: Vercel
Backend: Railway
Network: Stellar Testnet

Canonical public URL:
https://payoutlock.vercel.app/

Do not expose secrets or commit `.env` files.

## Change discipline

Before changing behavior:

1. Inspect the current implementation.
2. Preserve contract and settlement invariants.
3. Keep real Testnet behavior separate from simulated fiat behavior.
4. Do not invent product claims, integrations, customers, pricing, bank capabilities, or production readiness.
5. Keep changes scoped.
6. Prefer truthful limitations over optimistic assumptions.
