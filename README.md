# PayoutLock

Protected off-ramp infrastructure on Stellar. A user sends stablecoins on-chain, fiat settlement happens off-chain,
and PayoutLock protects the settlement gap with collateral-backed protection that anyone can verify on Stellar.

**This is a prototype. It runs on Stellar Testnet against a sandbox anchor (TR Mock Anchor). No real funds move.**

| Directory | What it is |
|---|---|
| [`contract/`](contract) | Soroban smart contract: protection lifecycle, collateral, attestation verification |
| [`attestor/`](attestor) | Orchestration API, attestor/relayer, funding verification and the keeper — see [attestor/README.md](attestor/README.md) |
| [`web/`](web) | React app: marketing site (`/`), Protected Cash Out (`/app`), demo scenarios (`/app/demo`), engineering console (`/developer`) — see [web/README.md](web/README.md) |

## Known limitations of this prototype

Read these before treating any part of this as production infrastructure.

### Attestor liveness: nothing watches the anchor by itself

A `SETTLED` attestation is only produced when someone holding the User's anchor JWT asks the backend to confirm the
payout (`/api/live/check-settlement`) while the protection is still `Pending` or `Grace`. The web app does this
automatically **while its tab is open**. The backend does not monitor the anchor on its own: it keeps the JWT only in
memory for the life of the protection (never on disk, in logs, in responses or in the browser; dropped at any terminal
state) and holds all protection state in memory.

So if the tab is closed, the JWT is unavailable or expired, or the backend restarts, nothing settles the protection.
What the system does about that:

- The keeper will **not** move a live protection from `Grace` to `Claimable` unless a fresh anchor observation says the
  payout is still unresolved. If the anchor can't be observed (no credentials, expired or rejected token, lookup
  error), or reports the payout `completed`/`refunded`, or returns an unrecognised status, the protection stays in
  `Grace`. Failing to observe is never treated as evidence that the payout failed. This protects the Guarantee
  Provider from a double recovery, at the price of liveness: the collateral stays locked until an operator acts
  (manual controls in `/developer`).
- A payout that completes after the grace deadline can no longer be settled: the contract refuses `SETTLED` once
  `grace_deadline` has passed.
- The keeper never calls `claim()`. Claiming is the User's own action.

**Production would need** persistent server-side settlement monitoring, an anchor webhook, or another reliable
settlement data source — plus persistent storage for protection state instead of the in-memory store.

### Other limits

- **In-memory backend state.** Protections opened before a backend restart are no longer tracked by the funding sweep
  or the keeper; use the `/developer` manual controls for those.
- **Demo-scale caps.** At most 2 USDC per protection and 2 active protections per wallet (configurable).
- **Simulated outcomes are simulated.** The mock anchor cannot fail a payout or refund principal, so the failure and
  refund paths are demonstrated at `/app/demo` with a simulated fiat source. They are always labelled as such.
- **Single guarantee provider account** funds all collateral; there is no pooling, pricing or risk model.
- **Not audited.** No security audit has been performed on the contract or the backend.
