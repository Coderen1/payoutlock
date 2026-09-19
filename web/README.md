# PayoutLock web

React 19 + TypeScript + Vite + Tailwind CSS v4. Runs on **Stellar Testnet** against a sandbox anchor — no real funds.

```bash
npm run dev      # http://localhost:5173  (API: VITE_API_URL, default http://localhost:8787)
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm test         # unit tests for the cash-out view logic (src/features/cashout/*.test.ts)
npm run flows    # browser flow tests of /app and /app/demo against a simulated chain/anchor (tools/flows)
npm run parity   # /developer identity + pixel/computed-style parity + route checks (tools/parity)
```

## Routes

| Route | What it is |
|---|---|
| `/` | Public marketing site |
| `/app`, `/app/cash-out/:reference` | Protected Cash Out — the real product flow |
| `/app/demo`, `/app/demo/:reference` | Hackathon demo scenarios (simulated fiat outcomes), kept apart from the product flow |
| `/developer` | The original engineering/test console, unchanged |
| `/_kit` | Component gallery — **development only**, not part of the production build |

`/`, `/app*` and `/developer` are separate lazy chunks (`src/AppRoutes.tsx`). The Stellar SDK and Wallets Kit
(~1 MB) load only on the routes that need them — never on the marketing site.

**Hosting:** this is a single-page app. Any host must serve `index.html` for unknown paths so that deep links
(`/app/cash-out/…`, `/developer`) work on refresh. `vite dev` and `vite preview` already do.

## Layout

```
src/
  styles/     design tokens (tokens.css), scoped base (base.css), entry (globals.css)
  ui/         design-system components (Button, Input, Card, Badge, Timeline, WalletChip, HashChip, Notice, ...)
    motion/   motion primitives (Reveal, Stagger, Crossfade, Breathe, AnimatedNumber) — load lazily via MotionProvider
  gallery/    the dev-only component gallery at /_kit (own stylesheet, never in the production CSS)
  features/cashout/  the /app and /app/demo product flow: pure view logic (view.ts), one hook (useCashOutFlow.ts)
                     over lib/ + hooks/, and the screens (Compose.tsx, Tracking.tsx, CashOutApp.tsx)
  routes/     route entry points (the marketing route is still a placeholder)
  developer/  the engineering console (DeveloperConsole.tsx + its stylesheet)
  components/ hooks/ lib/   console components and the chain/anchor/wallet logic — shared, not restyled
```

`lib/` and `hooks/` hold the proven wallet, anchor and Soroban logic (chain state is the source of truth,
submitted writes are confirmed by a follow-up read, the anchor JWT never leaves memory). New UI is built on top
of them; they are not edited for styling.

## Two stylesheets that must never meet

The redesign is styled with Tailwind, **without its global Preflight**. Preflight resets margins, box-sizing,
line-height and buttons on every element — which would change the console, whose markup relies on browser
defaults. Instead:

- Redesigned routes render inside `<PLRoot>` (`data-pl`); `styles/base.css` does the reset job scoped to it.
- The console's original global stylesheet lives in `developer/developer.css`, every selector prefixed with
  `body.dev-console-body`. `useLegacyConsoleBody()` adds that class to `<body>` only while `/developer` is mounted.

Keep it that way: no global element selectors outside those two scopes.

## Design tokens

`src/styles/tokens.css` is the single source (palette, type scale, radius, elevation, motion, breakpoints).
Tailwind's default palette is removed, so only PayoutLock colors exist. Text/background pairs are WCAG-AA checked
(4.5:1 text, 3:1 UI boundaries) — re-check when a color changes. The `seal` gradient is decorative and marks
active protection only.

## Protected Cash Out (`/app`, `/app/demo`)

`features/cashout/` holds both routes; `CashOutApp` takes a `mode` (`live` | `demo`) and nothing else differs except
the scenario chooser and the permanent "Stellar Testnet · Simulated fiat outcome" ribbon in the demo.

- **View logic is pure.** `view.ts` turns the on-chain record plus what the browser knows (funding check, anchor status,
  sign-in) into a status, timeline, one primary action and notices. It has no React and is unit-tested (`npm test`).
- **Chain state is the source of truth.** `useCashOutFlow` reads it through `useProtection`. The backend keeper moves a
  protection through Grace and Claimable; the UI never sends those transactions. The one on-chain action a person takes
  is *Claim Protection*, offered only when a fresh read says the state is Claimable.
- **Nothing sensitive persists.** Session and anchor JWT live in memory only. `localStorage` holds exactly
  `{ flow, reference }` (`storage.ts`); amounts, deadlines and state are re-read from Stellar.
- **No implementation terms on screen** (FUNDED, nonce, SAC, advance_to_*, enum names). They stay in `/developer`.
- **`/app` has no "Simulate…" controls.** Simulated bank outcomes exist only under `/app/demo`, chosen by the reference
  prefix (`demo_failure_`, `demo_refund_`).

### Flow tests (`npm run flows`)

`tools/flows/` drives real Chrome against the real UI with the wallet, API, anchor and chain modules replaced by a
simulated world (`world.js`, `stubs.mjs`) — no funds, no network beyond a mocked SEP-38 quote. It walks the live and demo
flows at 1280×900 and 390×844, asserts the rules above on every screen (no banned terms, no Simulate controls in `/app`,
ribbon in the demo, Testnet marker on the first screen, keeper transactions never sent by the UI, localStorage contents)
and writes screenshots to `tools/flows/out/` (git-ignored). It cannot exercise Freighter's own signing prompts; those
need a manual pass.
