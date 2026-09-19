export type ErrorKind = "session" | "wallet-rejected" | "limit" | "network" | "generic";

export interface FriendlyError {
  kind: ErrorKind;
  title: string;
  message: string;
  /** The raw text, kept out of the way (a collapsed "Details") for anyone who needs to report it. */
  detail?: string;
}

const REJECTED = /declin|reject|denied|cancel|closed|refus|user (?:abort|dismiss)/i;

/** Turns whatever the backend, the anchor, Horizon or the wallet threw into words a person can act on.
 * The raw message is never the headline. */
export function friendlyError(e: unknown): FriendlyError {
  const raw = e instanceof Error ? e.message : String(e);
  const detail = raw.length > 240 ? `${raw.slice(0, 240)}…` : raw;

  if (/invalid_or_expired_session|missing_session_token/.test(raw)) {
    return { kind: "session", title: "Your sign-in expired", message: "Sign in again to continue. It only takes one tap in your wallet." };
  }
  if (/too_many_active_protections_for_wallet/.test(raw)) {
    return { kind: "limit", title: "You already have cash outs in progress", message: "Wait for your current cash outs to finish, then try again.", detail };
  }
  if (/amount_exceeds_cap/.test(raw)) {
    return { kind: "limit", title: "That's more than can be protected right now", message: "Try a smaller amount.", detail };
  }
  if (/^Protection liquidity is temporarily insufficient/.test(raw)) {
    return { kind: "limit", title: "Protection isn't available right now", message: raw };
  }
  if (/duplicate_protection|request_already_in_progress/.test(raw)) {
    return { kind: "generic", title: "This cash out was already started", message: "Open it from your recent cash out instead of starting it again.", detail };
  }
  if (/unknown_protection|protection_not_found_on_chain/.test(raw)) {
    return { kind: "generic", title: "We can't continue this cash out from here", message: "The server no longer tracks it (it may have restarted). Nothing on Stellar changed. You can still see its status.", detail };
  }
  const minimum = /Minimum off-ramp is ([\d.]+) USDC/i.exec(raw);
  if (minimum) {
    return { kind: "limit", title: "That's below the minimum", message: `The minimum cash out is ${Number(minimum[1])} USDC.`, detail };
  }
  if (/SEP-10|challenge/i.test(raw)) {
    return { kind: "generic", title: "We couldn't sign in with the payout partner", message: "Try again in a moment.", detail };
  }
  if (/SEP-6|anchor_lookup_failed|anchor/i.test(raw)) {
    return { kind: "generic", title: "The payout partner couldn't start this cash out", message: "Try again in a moment.", detail };
  }
  if (REJECTED.test(raw)) {
    return { kind: "wallet-rejected", title: "You closed the wallet request", message: "Nothing was sent. Try again when you're ready." };
  }
  if (/Failed to fetch|NetworkError|network request failed|Load failed/i.test(raw)) {
    return { kind: "network", title: "Can't reach the network", message: "Check your connection and try again.", detail };
  }
  // Horizon and Soroban failures are already translated at the source (horizonErrors.ts) into plain sentences.
  if (/^[A-Z][^{}<>]{8,160}[.!]$/.test(raw)) {
    return { kind: "generic", title: "That didn't work", message: raw };
  }
  return { kind: "generic", title: "Something went wrong", message: "Please try again.", detail };
}

/** True when the failure means the app session (not the anchor's) needs renewing. */
export function isSessionError(e: unknown): boolean {
  return friendlyError(e).kind === "session";
}
