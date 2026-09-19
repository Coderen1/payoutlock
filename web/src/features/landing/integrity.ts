// What the landing page must never say, as patterns — shared by the unit tests (which check the copy file) and the
// browser test (which checks what is actually on screen), so both hold the page to the same rules.

/** Claims this prototype can't back: certainty it hasn't earned, other people's names, numbers nobody measured. */
export const UNVERIFIED = /\binsur(ed|ance|er)\b|guarante|trustless|main\s?net|trusted by|risk[- ]free|decentrali[sz]ed|audited|regulated|licen[sc]ed|100\s?%|\b\d+(\.\d+)?\s?%/i;

/** Money amounts and rates that would read as a real price. */
export const PRICING = /[$€£]\s?\d|\b\d+(\.\d+)?\s?(bps|basis points|per cent|percent)\b|\bper (transaction|cash[- ]?out|payout)\b/i;

/** Audience or volume figures: "10,000 users", "$5M of volume". */
export const METRICS = /\b\d[\d,.]*\s?[kmb]?\+?\s+(users|customers|wallets|partners|businesses|transactions|payouts)\b|\bTVL\b|\bvolume\b/i;

/** Infrastructure words. Fine for people who integrate; too much for anyone else. */
export const TECHNICAL = /\bcollateral\b|attestor|attestation|soroban|state machine|nonce|\bSAC\b|FUNDED|advance_to|keeper|escrow|smart contract|\bcontract\b|lifecycle|AwaitingFunding|Claimable/i;

/** Sections meant for people who integrate: infrastructure words are allowed there (they carry `data-technical`). */
export const TECHNICAL_SECTIONS = ["verify", "developers"] as const;
