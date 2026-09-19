# PayoutLock attestor / orchestration API

Node (TypeScript, run with native type stripping). Signs attestations, submits transactions through a relayer, verifies
funding directly against Horizon, and runs the keeper. **Stellar Testnet only.**

```bash
cp .env.example .env         # fill in the Testnet identities — .env is git-ignored, never commit it
npm run server               # API on :8787
npm run server:demo          # same, with /api/demo/* mounted (DEMO_MODE=true)
npm test                     # hermetic unit tests: no env, secrets or network
```

Roles are separate Stellar accounts: the **attestor** key only signs attestations, the **relayer** only submits
transactions and pays fees, the **guarantee provider** (GP) opens protections and locks collateral.

## The keeper

A thin, permissionless state-advancement loop (`src/server/keeper.ts`, rules in `keeperCore.ts`). The relayer submits
calls that the contract lets anyone make. It runs inside the API process every `KEEPER_INTERVAL_SECONDS`.

| State | Condition (ledger time, not wall clock) | Keeper action |
|---|---|---|
| `Pending` | `sla_deadline` has passed | `advance_to_grace` |
| `Grace` | `grace_deadline` has passed | `advance_to_claimable` — **live protections only if the anchor is freshly observed to be unresolved** (below) |
| `AwaitingFunding` | `funding_deadline` + buffer has passed **and no matching payment exists on-chain** | `expire_unfunded` |
| `Claimable` | — | nothing. **The keeper never calls `claim()`** |
| any terminal state | `Settled`, `Refunded`, `Claimed`, `Expired` | release the wallet's protection slot, forget any held anchor token |

The wallet's slot is also released right before the per-wallet cap check on every `open` route, so a protection that
just finished never causes a `429`. Releasing is idempotent.

### The live-protection guard

Demo protections (`demo-failure`, `demo-refund`) are synthetic — there is no anchor to consult — so they progress
automatically. A **live** protection goes `Grace → Claimable` only when, in that same tick, the anchor is asked and the
answer positively means the fiat payout was not delivered (`pending_*`, `on_hold`, `incomplete`, `error`, `expired`,
`no_market`, `too_small`, `too_large`). Everything else holds it in `Grace`:

- no anchor credentials held, an expired token, a rejected token, a network or anchor error
- the anchor reports `completed` or `refunded`
- a status the keeper doesn't recognise

`Pending → Grace` stays automatic for live protections: a `SETTLED` attestation is still accepted during `Grace`.
Manual controls in the `/developer` console are unchanged and remain the operator fallback.

### Anchor JWT handling

To ask the anchor, the backend keeps the User's SEP-10 JWT from `open-protection` (refreshed by `check-settlement`):

- **memory only**, keyed by protection — never written to disk, logs, API responses, or the browser
- the only reader is the keeper's anchor observation; nothing can list or serialise what is held
- dropped at any terminal state, and when the token is within 30 s of its `exp`
- error text is passed through a redaction step before it can be logged

This is a deliberate, narrow exception to "the backend never holds the JWT"; the reason is to let the keeper fail safe.
See the liveness limitation in the [root README](../README.md#attestor-liveness-nothing-watches-the-anchor-by-itself).

### Configuration

| Variable | Default | Meaning |
|---|---|---|
| `KEEPER_ENABLED` | `true` | `false` leaves only the `/developer` manual controls |
| `KEEPER_INTERVAL_SECONDS` | `10` | tick interval |
| `KEEPER_EXPIRE_BUFFER_SECONDS` | `30` | extra time past `funding_deadline` before an unfunded protection may be expired (Horizon lag, sweep interval) |
| `MAX_ACTIVE_PROTECTIONS_PER_WALLET` | `2` | per-wallet cap |
| `MAX_PROTECTED_AMOUNT_STROOPS` | `20000000` | 2 USDC per protection |

## Scenarios (real Testnet, need a running API and funded Testnet identities)

| Command | What it proves |
|---|---|
| `npm run scenario-failure-claim` / `scenario-refund` | the simulated failure and refund paths, driven directly |
| `npm run scenario-keeper` | keeper advances `Pending → Grace → Claimable` with no manual call; slots free up after a claim and after an expiry |
| `npm run scenario-keeper-live -- lifecycle` | free: a live protection is opened but never funded; the keeper expires it and frees the slot |
| `npm run scenario-keeper-live -- settle` | the real happy path against the mock anchor: fund → anchor completes → `check-settlement` → `Settled`. Costs the User 1 USDC (paid to the anchor) |
| `npm run scenario-keeper-live -- guard` | the live guard: funded and then left alone, the keeper must not advance while the anchor says `completed`. Ends in a claim, so it needs a GP holding ≥ 2 USDC and refuses to run otherwise |

Start the API for the keeper scenarios with `DEMO_MODE=true MAX_ACTIVE_PROTECTIONS_PER_WALLET=1
KEEPER_INTERVAL_SECONDS=5 KEEPER_EXPIRE_BUFFER_SECONDS=5 npm run server`. They spend real Testnet USDC — the header of
each script states the cost. The mock anchor enforces a **1 USDC** minimum withdrawal (its `/sep6/info` says 0.5).
