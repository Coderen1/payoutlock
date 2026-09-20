# Web architecture

Contributor notes for `web/` — the React app behind `/`, `/app`, `/app/demo` and `/developer`.

For what PayoutLock *is*, the live prototype, the contract and the Testnet proof, see the [root README](../README.md). This document is only about how the frontend is built and which rules must not be broken.

**Stack:** React 19 · TypeScript · Vite 8 · Tailwind CSS v4 (no Preflight) · Motion · Lucide · Geist · Stellar Wallets Kit.

```bash
cd web
npm install
npm run dev      # http://localhost:5173  (API: VITE_API_URL, default http://localhost:8787)
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

---

## Routes and code splitting

| Route | What it is |
|---|---|
| `/` | Public landing page: the story, who it is for, real Testnet proof, the developers' section |
| `/app`, `/app/cash-out/:reference` | Protected Cash Out — the real product flow |
| `/app/demo`, `/app/demo/:reference` | Demo scenarios (simulated fiat outcomes), kept apart from the product flow |
| `/developer` | The original engineering/test console, unchanged |
| `/_kit` | Component gallery — **development only**, never in the production build |

`/`, `/app*` and `/developer` are separate lazy chunks (`src/AppRoutes.tsx`). The Stellar SDK and Wallets Kit (~1 MB) load only on the routes that need them — **never on the landing page**.

**Hosting.** This is a single-page app. Any host must serve `index.html` for unknown paths, or deep links (`/app/cash-out/…`, `/developer`) break on refresh and on direct entry. `vite dev` and `vite preview` do this already; a static host needs an explicit SPA rewrite.

---

## Layout

```
src/
  styles/     design tokens (tokens.css), scoped base (base.css), entry (globals.css)
  ui/         design-system components (Button, Input, Card, Badge, Timeline, WalletChip,
              HashChip, Notice, ...)
    motion/   motion primitives (Reveal, Stagger, Crossfade, Breathe, AnimatedNumber)
              — loaded lazily via MotionProvider
  gallery/    the dev-only component gallery at /_kit (own stylesheet, never in production CSS)
  features/
    cashout/  the /app and /app/demo product flow: pure view logic (view.ts), one hook
              (useCashOutFlow.ts) over lib/ + hooks/, and the screens (Compose.tsx,
              Tracking.tsx, CashOutApp.tsx)
    landing/  the public landing page: copy.ts (every word), proof.ts (real Testnet records),
              the settlement line (SettlementLine.tsx + landing.css), the pinned scene's
              script (timeline.ts) and sections/
  routes/     route entry points
  developer/  the engineering console (DeveloperConsole.tsx + its stylesheet)
  components/ hooks/ lib/   console components and the chain/anchor/wallet logic
```

> [!IMPORTANT]
> **`lib/`, `hooks/` and `components/` are frozen.** They hold the proven wallet, anchor and Soroban logic: chain state is the source of truth, submitted writes are confirmed by a follow-up read, and the anchor JWT never leaves memory. New UI is built *on top* of them. **They are never edited for styling.**

---

## Two stylesheets that must never meet

The redesign is styled with Tailwind **without its global Preflight**. Preflight resets margins, box-sizing, line-height and buttons on every element — which measurably changes the `/developer` console, whose markup relies on browser defaults. Instead:

- Redesigned routes render inside `<PLRoot>` (`data-pl`); `styles/base.css` does the reset job **scoped to it**.
- The console's original global stylesheet lives in `developer/developer.css`, every selector prefixed with `body.dev-console-body`. `useLegacyConsoleBody()` adds that class to `<body>` only while `/developer` is mounted.

**Keep it that way: no global element selectors outside those two scopes.** After any change to global CSS, re-run `npm run parity` — it checks the console for identity, pixel and computed-style parity across 31 scenes plus route checks, and must stay green.

## Design tokens

`src/styles/tokens.css` is the single source: palette, type scale, radius, elevation, motion, breakpoints. Tailwind's default palette is removed, so only PayoutLock colors exist.

Text/background pairs are WCAG-AA checked (4.5:1 for text, 3:1 for UI boundaries) and `npm run landing` measures contrast on every piece of text on the page. **When a contrast check fails, fix the color — never loosen the threshold.**

The `seal` gradient is decorative and marks **active protection only**. Don't reuse it as a general accent.

---

## Protected Cash Out (`/app`, `/app/demo`)

`features/cashout/` holds both routes. `CashOutApp` takes a `mode` (`live` | `demo`) and nothing else differs except the scenario chooser and the permanent **"Stellar Testnet · Simulated fiat outcome"** ribbon in the demo.

- **View logic is pure.** `view.ts` turns the on-chain record plus what the browser knows (funding check, anchor status, sign-in) into a status, a timeline, one primary action and notices. It has no React and is unit-tested (`npm test`).
- **Chain state is the source of truth.** `useCashOutFlow` reads it through `useProtection`. The backend keeper moves a protection through Grace and Claimable; **the UI never sends those transactions.** The one on-chain action a person takes is *Claim Protection*, offered only when a fresh read says the state is Claimable.
- **Nothing sensitive persists.** Session and anchor JWT live in memory only. `localStorage` holds exactly `{ flow, reference }` (`storage.ts`); amounts, deadlines and state are re-read from Stellar.
- **No implementation terms on screen** — no FUNDED, nonce, SAC, `advance_to_*` or enum names. Those stay in `/developer`.
- **`/app` has no "Simulate…" controls.** Simulated bank outcomes exist only under `/app/demo`, chosen by the reference prefix (`demo_failure_`, `demo_refund_`).

### Flow tests — `npm run flows`

`tools/flows/` drives real Chrome against the real UI with the wallet, API, anchor and chain modules replaced by a simulated world (`world.js`, `stubs.mjs`) — no funds, no network beyond a mocked SEP-38 quote. It walks the live and demo flows at **1280×900** and **390×844** and asserts, on every screen:

- no banned implementation terms anywhere in `/app`
- no "Simulate" controls in `/app`
- the simulated-outcome ribbon is present throughout `/app/demo`
- a **Testnet marker on the first screen at every width**
- keeper transactions are never sent by the UI
- `localStorage` contains nothing but `{ flow, reference }`

Screenshots go to `tools/flows/out/` (git-ignored).

> [!WARNING]
> Flow tests **cannot** exercise Freighter's own signing prompts — those run in the extension, outside the page. A green `npm run flows` does not mean wallet signing works. That still needs a manual pass against a real wallet.

---

## Landing page (`/`)

`features/landing/`. It never touches the wallet, the API or the Stellar SDK — everything on it is static — so the first load stays small (see `npm run parity` for the numbers).

### Copy and integrity

**All copy is in `copy.ts`.** Components choose layout and motion; they don't write sentences.

Two registers: the sections for everyone use no infrastructure words (collateral, attestor, Soroban, …); only `verify` and `developers` (marked `data-technical`) may.

`integrity.ts` holds the patterns for what the page must never say — insured, guaranteed, trustless, Mainnet, percentages, prices, user or volume figures — and **both** the unit tests (against the copy file) and the browser test (against what is actually rendered) check them, so the two can't drift.

The provider role is called a **protection provider** in public copy. "Guarantee Provider" stays in `/developer` and technical docs; `guarantee_provider` is the contract's own field name.

### The settlement line

One anatomy (chain, gap, end, protection band) driven by three numbers — `--chain`, `--gp`, `--band` (`landing.css`).

The settlement-gap section (`GapSection.tsx`) is one dark panel on the warm page. On a wide window tall enough to hold it, it **pins for half a screen of scrolling** while the line draws: `scroll.ts` writes one number, `--p`, and CSS does the rest — **no re-renders, no scroll hijacking**. Otherwise it scrolls normally and the line draws as it passes. With reduced motion it is simply finished.

Its script is data (`timeline.ts`) and is unit-tested. The claim path it shows is the accurate one: a claim only after the deadline passes with nothing returned.

### The product and hero surfaces

- **`ProductSection.tsx` / `ProductStage.tsx`** — one product surface in the hero's visual family, built from the app's own components, playing three paths: payout arrives, payout doesn't arrive, principal returned (the last labelled a simulated outcome in the Testnet demo).
- **`PayoutCard.tsx`** — the bank-payout card, shared with the hero.
- **`HeroVisual.tsx`** — draws a protected cash out from the app's own components (Card, StatusBadge, Amount, SummaryRow, TimelineCompact), **never a screenshot**. Its layers sit on the card's padding, never its content (tested).

### The proof section

`proof.ts` holds **real Testnet records** — the contract, one settled and one claimed cash out — each linking to Stellar Expert. Nothing there is an example or a placeholder.

```bash
npm run proof:verify
```

checks every hash against Horizon: that it succeeded, when its ledger closed, and that it called this contract with the expected function, on the expected protection, for the expected amount.

> Testnet is reset from time to time. When that happens this command fails, and the records must be replaced with a fresh run of the `attestor` scenarios — **never left as dead links.**

---

## Test and tooling reference

```bash
npm test                # unit: cash-out view logic, landing copy, claims, proof format, scene timing
npm run flows           # real Chrome: /app and /app/demo against a simulated chain/anchor
npm run landing         # real Chrome: what is on screen, links, overflow at six widths, the pinned
                        # scene at five scroll positions, phone layout, reduced motion, the keyboard,
                        # and text contrast measured on every piece of text
npm run proof:verify    # re-checks the real Testnet records against Horizon (read-only, no keys)
npm run parity          # /developer identity + pixel/computed-style parity + route checks
npm run parity:baseline # re-record the console baseline (only when a console change is intended)
npm run parity:check    # compare against the recorded baseline
npm run parity:routes   # route checks only
npm run gallery:shots   # component gallery screenshots
```

Browser tests write screenshots to `tools/flows/out/`, `tools/landing/out/` and `tools/gallery/out/` — all git-ignored.

### What must stay green

| Change you made | Re-run |
|---|---|
| Anything in global CSS or `styles/` | `npm run parity` **and** `npm run landing` |
| Landing copy | `npm test` **and** `npm run landing` |
| `/app` or `/app/demo` screens | `npm run flows` |
| `view.ts` or lifecycle logic | `npm test` |
| After a Testnet reset | `npm run proof:verify`, then replace the records |
