# Console parity tooling

The engineering console at `/developer` is the proven MVP surface. This tool proves, after any change to the
web app, that it still looks and behaves exactly like the original. It uses Playwright (driving your installed
Chrome), `pixelmatch` and `pngjs` — nothing else.

```bash
npm run parity            # identity + check + routes
npm run parity:baseline   # rebuild the original app from the pinned commit and capture it
npm run parity:check      # current tree vs baseline
npm run parity:routes     # production build: routes, isolation, code splitting
```

Requirements: Google Chrome (or `PARITY_CHROME_PATH=/path/to/chrome`), and a git checkout containing the baseline
commit pinned in `run.mjs` (`BASELINE_COMMIT`, the state before the redesign started). Outputs go to `out/` and
`.work/`, both git-ignored.

## What it checks

**`check`** renders 31 scenes in the original app and in the current tree with identical mocked network responses and
compares them: screenshots pixel for pixel (threshold 0), plus every element's tag, text, bounding box and *every*
computed style property.

- 13 scenes drive the real console (`App` at `/` in the baseline, `DeveloperConsole` at `/developer` now): API
  unreachable, disconnected, connected on each tab, and the wallet-readiness gate in each of its states, desktop and mobile.
- 18 scenes render the real `ProtectionCard` in all ten states and `WalletReadinessGate` in all five, plus a page that
  uses every class of the legacy stylesheet. The current flavour loads the design-system CSS too, so bleed between the
  two worlds would show up.

**`identity`** needs no browser: `src/components`, `src/hooks` and `src/lib` must be code-identical to the baseline
(comment-only edits are reported and allowed), and `developer.css` must be the baseline stylesheet with nothing changed
but the `body.dev-console-body` selector prefix.

**`routes`** runs against the production build: every route renders (deep links included), the design system is
applied, the redesigned routes own the whole viewport, no horizontal overflow at 360/390 px, the marketing route
downloads no Stellar SDK, and client-side navigation between `/` and `/developer` never lets one stylesheet affect the other.

## What it can't check

Anything that needs a real wallet signature (connect, pay, claim). The code behind those flows is covered by
`identity`; exercise them by hand on Testnet after a change that could touch them.

## Trust the check, not just the result

A parity test that cannot fail proves nothing. When this was built, two negative controls were run and both produced
large diffs: the legacy stylesheet without its `body` class, and a stock Tailwind Preflight loaded globally
(24–251 thousand differing pixels). If you change the harness, do the same.

`out/` and `.work/` are regenerated on demand; the harness (`harness/`) and the scripts are the source of truth.
