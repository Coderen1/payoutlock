# PayoutLock web

React 19 + TypeScript + Vite + Tailwind CSS v4. Runs on **Stellar Testnet** against a sandbox anchor — no real funds.

```bash
npm run dev      # http://localhost:5173  (API: VITE_API_URL, default http://localhost:8787)
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```

## Routes

| Route | What it is |
|---|---|
| `/` | Public marketing site |
| `/app`, `/app/cash-out/:reference` | Protected Cash Out — the real product flow |
| `/app/demo`, `/app/demo/:reference` | Hackathon demo scenarios (simulated fiat outcomes), kept apart from the product flow |
| `/developer` | The original engineering/test console, unchanged |

`/`, `/app*` and `/developer` are separate lazy chunks (`src/AppRoutes.tsx`). The Stellar SDK and Wallets Kit
(~1 MB) load only on the routes that need them — never on the marketing site.

**Hosting:** this is a single-page app. Any host must serve `index.html` for unknown paths so that deep links
(`/app/cash-out/…`, `/developer`) work on refresh. `vite dev` and `vite preview` already do.

## Layout

```
src/
  styles/     design tokens (tokens.css), scoped base (base.css), entry (globals.css)
  ui/         design-system building blocks (cn, PLRoot, TestnetPill, useDocumentMeta)
  routes/     redesigned routes (placeholders until each one is built)
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
