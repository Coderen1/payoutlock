// Every word on the landing page lives here, so it can be read in one place, tested as a whole, and reused as the
// "final copy" for review. Components choose layout and motion; they don't write sentences.
//
// Two audiences, two registers. The first half of the page is for anyone: no infrastructure words. The technical
// sections (`verify`, `developers`) are where contracts, attestors and lifecycle states may appear — and the tests
// hold each side to that. Nothing here claims what isn't true: it is a Testnet prototype, the business model is a
// hypothesis, and no price, partner, user count or volume is stated.

export const HERO = {
  eyebrow: "Stellar Testnet · Sandbox anchor",
  title: "Cash out with confidence.",
  lead: "You send stablecoins to cash out. If the bank payout fails and your money isn't returned, PayoutLock protects you.",
  note: "A working prototype on Stellar Testnet. No real money.",
  audience: "Built for wallets, anchors and off-ramp providers",
  /** The product beside the headline: one moment of a cash out, in the words and components the real app uses.
   * The status label and the step names come from the product itself (ui/lifecycle, STEPS). */
  visual: {
    description:
      "Illustration of a protected cash out in progress: you send 1.00 USDC, 1.00 USDC of protection is active, the payment is verified on Stellar, and the bank payout is processing, step 4 of 5.",
    caption: "Illustration · Stellar Testnet",
    eyebrow: "Protected cash out",
    sendLabel: "You send",
    amount: "1.00",
    currency: "USDC",
    receiveLabel: "You receive",
    receive: "TRY by bank transfer",
    protectionLabel: "Protection",
    protectionHint: "Covered until your bank payout arrives",
    /** Index into STEPS: the payout is processing. */
    currentStep: 3,
    verified: "Payment verified on Stellar",
    payout: { title: "Bank payout", status: "Processing", start: "Sent on Stellar", band: "1.00 USDC protected", end: "Bank" },
  },
} as const;

export const CTA = {
  demo: "Launch Demo",
  app: "Open App",
  developer: "Developer Console",
} as const;

export const NAV = {
  skip: "Skip to content",
  links: [
    { label: "How it works", href: "#gap" },
    { label: "For businesses", href: "#businesses" },
    { label: "Verify", href: "#verify" },
    { label: "Developers", href: "#developers" },
  ],
} as const;

/** The settlement gap: one panel, one headline, the line as the picture. The problem, what covers it, and — accurately —
 * the only path that ends in a claim. */
export const GAP = {
  label: "The settlement gap",
  title: "Stablecoins settle on-chain in seconds. The bank payout doesn't.",
  line: {
    start: { title: "You send USDC", detail: "Stellar · seconds" },
    gap: "Settlement gap",
    end: { title: "Bank payout", detail: "Off-chain" },
    band: "PayoutLock protection",
  },
  phases: [
    { title: "USDC settles on Stellar", body: "Your payment is final on-chain within seconds." },
    { title: "The bank payout is unresolved", body: "The transfer to your bank happens off-chain and can take longer than expected." },
    { title: "Protection stays in place", body: "Set aside for the full amount before you send, it stays until the payout is resolved." },
  ],
  failure: {
    label: "If the payout never arrives",
    /** Between "Payout delayed" and "Protection available": what has to be true before anyone can claim. */
    condition: "Deadline passes, nothing returned",
    claim: "You claim it",
    returned: "If your USDC is returned instead, protection is released.",
    note: "A failed payout doesn't pay out by itself. Protection becomes available to claim only after its deadline passes and your USDC hasn't been returned.",
  },
} as const;

/** The five steps of a cash out, as the app names them (the /app timeline). The hero and the product surface draw
 * their progress with these. */
export const STEPS = ["Preparing", "Protection ready", "Funding verified", "Fiat payout processing", "Outcome"] as const;

/** One product surface, three ways a cash out can go. Stage words follow the app (ui/lifecycle, the /app timeline). */
export const PRODUCT = {
  eyebrow: "Protected Cash Out",
  title: "What your customers see.",
  body: "Inside a wallet or an off-ramp, protection is one amount and one status. People always know what is covered and what happens next.",
  note: "Illustration of the Protected Cash Out experience. The working version runs on Stellar Testnet.",
  stepperLabel: "Stages",
  paths: [
    { id: "arrives", tab: "Payout arrives", summary: "The bank payout arrives and protection is released.", stages: ["ready", "active", "settled"] },
    { id: "missed", tab: "Payout doesn't arrive", summary: "The deadline passes with nothing returned, and you claim your protection.", stages: ["delayed", "available", "claimed"] },
    {
      id: "returned",
      tab: "Principal returned",
      summary: "Your USDC comes back and protection is released.",
      stages: ["active", "returned"],
      simulated: "Simulated outcome in the Testnet demo",
    },
  ],
  surface: {
    eyebrow: "Protected cash out",
    amount: "1.00",
    currency: "USDC",
    receiveLabel: "You receive",
    receive: "TRY by bank transfer",
    protectionLabel: "Protection",
    verified: "Payment verified on Stellar",
    readyChip: "Protection ready before you send",
    simulatedBadge: "Simulated bank payout",
    payoutTitle: "Bank payout",
  },
  /** Each stage: the status the app shows, what it says, and where the payout stands. `steps` is the five-step
   * progress (Preparing, Protection ready, Funding verified, the payout, the outcome) as the app draws it. */
  stages: {
    ready: {
      status: "ready",
      amountLabel: "You send",
      body: "Send 1.00 USDC to start your protected payout.",
      protectionHint: "Set aside before you send",
      steps: ["done", "current", "upcoming", "upcoming", "upcoming"],
      payoutStep: "Fiat payout processing",
      outcomeStep: "Outcome",
      protectedNow: false,
      action: "Send 1.00 USDC",
      payout: { state: "idle", status: "Not started", start: "Stellar", band: "1.00 USDC protected", end: "Bank" },
    },
    active: {
      status: "active",
      amountLabel: "You sent",
      body: "Your 1.00 USDC is covered while the bank payout is processed.",
      protectionHint: "Covered until your bank payout arrives",
      steps: ["done", "done", "done", "current", "upcoming"],
      payoutStep: "Fiat payout processing",
      outcomeStep: "Outcome",
      protectedNow: true,
      payout: { state: "processing", status: "Processing", start: "Sent on Stellar", band: "1.00 USDC protected", end: "Bank" },
    },
    settled: {
      status: "settled",
      amountLabel: "You sent",
      body: "Your bank payout completed. Protection is released.",
      protectionHint: "Released when the payout arrived",
      steps: ["done", "done", "done", "done", "done"],
      payoutStep: "Fiat payout completed",
      outcomeStep: "Settled",
      protectedNow: false,
      payout: { state: "arrived", status: "Arrived", start: "Sent on Stellar", band: "Protection released", end: "Bank" },
    },
    delayed: {
      status: "delayed",
      amountLabel: "You sent",
      body: "Taking longer than expected. Your protection is still in place.",
      protectionHint: "Still covered while the payout is late",
      steps: ["done", "done", "done", "attention", "upcoming"],
      payoutStep: "Payout delayed",
      outcomeStep: "Outcome",
      protectedNow: true,
      payout: { state: "delayed", status: "Delayed", start: "Sent on Stellar", band: "1.00 USDC protected", end: "Bank" },
    },
    available: {
      status: "available",
      amountLabel: "You sent",
      body: "The deadline passed and nothing was returned. You can claim your 1.00 USDC.",
      protectionHint: "Available to claim",
      steps: ["done", "done", "done", "done", "current"],
      payoutStep: "Payout didn't arrive in time",
      outcomeStep: "Protection available",
      protectedNow: true,
      action: "Claim Protection",
      payout: { state: "missed", status: "Didn't arrive", start: "Sent on Stellar", band: "Ready to claim", end: "Bank" },
    },
    claimed: {
      status: "claimed",
      amountLabel: "Protection paid",
      body: "Your protection paid 1.00 USDC to your wallet.",
      protectionHint: "Paid to your wallet",
      steps: ["done", "done", "done", "done", "done"],
      payoutStep: "Payout didn't arrive in time",
      outcomeStep: "Claimed",
      protectedNow: false,
      payout: { state: "paid", status: "Claimed", start: "Paid to your wallet", band: "Protection paid", end: "Bank" },
    },
    returned: {
      status: "returned",
      amountLabel: "You sent",
      body: "Your 1.00 USDC was returned to your wallet. Protection is released.",
      protectionHint: "Released when your USDC came back",
      steps: ["done", "done", "done", "done", "done"],
      payoutStep: "Payout returned",
      outcomeStep: "Principal returned",
      protectedNow: false,
      simulated: true,
      payout: { state: "returned", status: "Returned", start: "Returned to your wallet", band: "Protection released", end: "Bank" },
    },
  },
} as const;

export type StageId = keyof typeof PRODUCT.stages;

export const BUSINESS = {
  eyebrow: "For businesses",
  title: "We don't replace wallets or off-ramp providers.",
  titleContinued: "We add a protection layer to the cash-out flow they already run.",
  audienceNote: "Their customers see Protected Cash Out. Wallets and off-ramp providers are the ones who integrate it.",
  illustrationNote: "Illustrations. PayoutLock runs on Stellar Testnet today; no wallet or off-ramp integration is live yet.",
  customers: [
    {
      id: "wallet",
      name: "Wallets",
      summary: "Protected cash-outs inside the app your customers already use.",
      points: ["Offer safer cash-outs", "Increase user trust", "Add protection without building the infrastructure yourself"],
      surface: { title: "Cash out", amount: "1.00", currency: "USDC", to: "To your bank · TRY", protectedBy: "Protected by PayoutLock", covered: "1.00 USDC protected", action: "Cash out" },
    },
    {
      id: "offramp",
      name: "Off-ramp providers",
      summary: "Anchors and payout partners that turn stablecoins into bank transfers.",
      points: ["Add a protection layer to existing payout flows", "Improve recovery when a payout is delayed", "Differentiate your cash-out product"],
      surface: {
        title: "Payouts",
        rows: [
          { name: "Bank payout", detail: "1.00 USDC → TRY", status: "Processing", protection: "Protected" },
          { name: "Bank payout", detail: "1.00 USDC → TRY", status: "Delayed", protection: "Protected" },
          { name: "Bank payout", detail: "1.00 USDC → TRY", status: "Settled", protection: "Released" },
        ],
      },
    },
  ],
  model: {
    label: "Business model hypothesis",
    nodes: [
      { id: "business", name: "Wallet / Off-ramp", body: "Offers protected cash-outs" },
      { id: "payoutlock", name: "PayoutLock", body: "Runs the protection layer, can keep a platform fee" },
      { id: "provider", name: "Protection provider", body: "Supplies the capital, takes the settlement risk" },
    ],
    links: ["Protection fee", "Provider compensation"],
    /** Where one protection fee would go. */
    split: { fee: "Protection fee", parts: ["Protection provider compensation", "PayoutLock platform fee"] },
    body: "Businesses integrate PayoutLock to offer protected cash-outs. Protection providers supply the capital, and PayoutLock can earn a platform fee from protected transactions.",
    caveat: "A hypothesis we are testing. Pricing hasn't been validated, and the Testnet prototype charges no protection fee.",
  },
} as const;

/** Technical: contract and transaction language is allowed here. */
export const VERIFY = {
  eyebrow: "Verifiable on Stellar",
  title: "This is not just a concept.",
  titleContinued: "It is running on Stellar Testnet.",
  body: "Protection lives in a contract on Stellar Testnet, and every cash out is a public record anyone can open. Two real ones:",
  contractLabel: "Protection contract",
  network: "Stellar Testnet",
  settled: {
    title: "Settled",
    detail: "Sandbox anchor payout",
    steps: ["Protection opened", "Payment verified", "Payout completed"],
    tx: "Settlement transaction",
  },
  claimed: {
    title: "Claimed",
    detail: "Demo scenario",
    steps: ["Protection opened", "Payment verified", "Payout didn't arrive", "Claimed"],
    tx: "Claim transaction",
    simulated: "Simulated payout failure · real on-chain claim",
  },
  note: "The claimed example comes from a demo scenario: the bank payout failure was simulated, but the claim transaction on Stellar is real.",
} as const;

/** Technical: contracts, attestors and lifecycle states are allowed here. The one rule: the contract never learns
 * about the bank itself — it acts on signed attestations, deadlines and the payment it receives. */
export const DEVELOPERS = {
  eyebrow: "For developers",
  title: "Protection that plugs into your cash-out flow.",
  titleContinued: "PayoutLock watches the payout. Stellar enforces the outcome.",
  columns: [
    {
      id: "flow",
      label: "Your cash-out flow",
      tag: "Already running",
      items: [
        { id: "app", name: "Wallet or off-ramp app", body: "Starts the cash out, as it does today." },
        { id: "anchor", name: "Anchor withdrawal", body: "Your payout partner sends the bank transfer." },
      ],
    },
    {
      id: "payoutlock",
      label: "PayoutLock protection",
      tag: "Added",
      items: [
        { id: "api", name: "Protection API", body: "Opens a protection when a cash out starts." },
        { id: "attestor", name: "Attestor", body: "Reads the anchor's payout status and signs an attestation." },
        { id: "keeper", name: "Keeper", body: "Moves a protection on when a deadline passes. Never claims." },
      ],
    },
    {
      id: "stellar",
      label: "Stellar · Soroban",
      tag: "On-chain",
      items: [
        {
          id: "contract",
          name: "Protection contract",
          body: "Holds the protection provider's capital for each cash out, verifies attestation signatures and deadlines, and pays a claim to the customer's wallet.",
        },
      ],
    },
  ],
  links: { start: "Cash out starts", status: "Payout status", open: "Open protection", attestation: "Signed attestation", deadline: "Deadline passed" },
  states: ["AwaitingFunding", "Pending", "Grace", "Claimable", "Claimed"],
  terminal: ["Settled", "Refunded", "Expired"],
  boundary: "The contract never sees the bank or holds the user's principal. It acts on signed attestations, on-chain deadlines and the protection collateral locked in the contract.",
  apiLabel: "API",
  api: ["POST /api/live/open-protection", "GET /api/protections/{anchorWithdrawalId}"],
  limits: "Testnet prototype: the attestor and keeper run as one PayoutLock service today.",
} as const;

export const FINAL = {
  title: "See it run on Stellar Testnet.",
  body: "Launch the demo to watch a protected cash out settle, fail and recover. No real money involved.",
} as const;

export const FOOTER = {
  disclaimer: "PayoutLock is a prototype running on Stellar Testnet with a sandbox anchor. It is not a live financial service.",
} as const;

// ---- for the tests and the review: the copy as flat lists of strings

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

/** Sections for anyone: no infrastructure words. */
export const PUBLIC_COPY = { HERO, CTA, NAV, GAP, STEPS, PRODUCT, BUSINESS, FINAL, FOOTER };
/** Sections for people who integrate: technical words allowed. */
export const TECHNICAL_COPY = { VERIFY, DEVELOPERS };

export const publicStrings = (): string[] => strings(PUBLIC_COPY);
export const technicalStrings = (): string[] => strings(TECHNICAL_COPY);
export const allStrings = (): string[] => [...publicStrings(), ...technicalStrings()];
