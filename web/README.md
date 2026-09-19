# PayoutLock web

React 19 + TypeScript + Vite + Tailwind CSS v4. Runs on **Stellar Testnet** against a sandbox anchor — no real funds.

```bash
npm run dev      # http://localhost:5173  (API: VITE_API_URL, default http://localhost:8787)
npm run build    # tsc -b && vite build
npm run lint     # oxlint
npm test         # unit tests for the cash-out view logic (src/features/cashout/*.test.ts)
npm run flows    # browser flow tests of /app and /app/demo against a simulated chain/anchor (tools/flows)
npm run landing  # browser tests of the landing page: claims, links, layout, motion, keyboard, contrast (tools/landing)
npm run proof:verify  # re-checks the real Testnet records shown on the landing page against Horizon
npm run parity   # /developer identity + pixel/computed-style parity + route checks (tools/parity)
```

## Routes

| Route | What it is |
|---|---|
| `/` | Public landing page: the story, who it is for, real proof, and the developers' section |
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
  features/landing/  the public landing page: copy.ts (every word), proof.ts (real Testnet records), the settlement
                     line (SettlementLine.tsx + landing.css), the pinned scene's script (timeline.ts) and sections/
  routes/     route entry points
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

## Landing page (`/`)

`features/landing/`. It never touches the wallet, the API or the Stellar SDK — everything on it is static — so the
first load stays small (see `npm run parity` for the numbers).

- **All copy is in `copy.ts`.** Components choose layout and motion; they don't write sentences. Two registers: the
  sections for everyone use no infrastructure words (collateral, attestor, Soroban, ...); only `verify` and
  `developers` (marked `data-technical`) may. `integrity.ts` holds the patterns for what the page must never say
  (insured, guaranteed, trustless, Mainnet, percentages, prices, user or volume figures) and both the unit tests and the
  browser test check against them. The provider role is called a *protection provider*; "Guarantee Provider" stays in
  `/developer` and the technical docs.
- **The settlement line** is one anatomy (chain, gap, end, protection band) driven by three numbers, `--chain`,
  `--gp`, `--band` (`landing.css`). The settlement-gap section (`GapSection.tsx`) is one dark panel on the warm page: on a
  wide window tall enough to hold it, it pins for half a screen of scrolling while the line draws (`scroll.ts` writes one
  number, `--p`, and CSS does the rest — no re-renders, no scroll hijacking); otherwise it scrolls normally and the line
  draws as it passes; with reduced motion it is finished. Its script is data (`timeline.ts`) and is unit-tested. The
  claim path it shows is the accurate one: a claim only after the deadline passes with nothing returned.
- **The product section** (`ProductSection.tsx`, `ProductStage.tsx`) is one product surface in the hero's visual family,
  built from the app's components, playing three paths — payout arrives, payout doesn't arrive, principal returned (the
  last labelled a simulated outcome in the Testnet demo). `PayoutCard.tsx` is the bank-payout card shared with the hero.
- **The proof section shows real Testnet records** (`proof.ts`): the contract, one settled and one claimed cash out,
  each linking to Stellar Expert. `npm run proof:verify` checks every hash against Horizon (it succeeded, when it
  closed, that it called this contract with the expected function and protection). Testnet is reset from time to time:
  when that happens the command fails, and the records must be replaced with a fresh run — never left as dead links.
- **The hero is product-first.** `HeroVisual.tsx` draws a protected cash out from the app's own components (Card,
  StatusBadge, Amount, SummaryRow, TimelineCompact) — never a screenshot — with the settlement line in miniature inside
  the bank-payout card. Its layers sit on the card's padding, never its content (tested).
- **Tests:** `npm test` (copy, claims, proof format, the scene's timing) and `npm run landing` (real Chrome: what is on
  screen, links, overflow at six widths, the pinned scene at five scroll positions, phone layout, reduced motion, the
  keyboard, and text contrast measured on every piece of text). Screenshots go to `tools/landing/out/` (git-ignored).
