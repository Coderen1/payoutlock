// The User's anchor JWT, held ONLY in this process's memory and ONLY for the
// life of the LIVE protection it belongs to.
//
//  - never written to disk, logs, API responses or the browser
//  - dropped when the protection reaches a terminal state, and when the token
//    itself is about to expire
//  - the only reader is the keeper's anchor observation (keeper.ts): before a
//    live protection may be moved Grace -> Claimable the keeper asks the anchor
//    whether the payout is still unresolved, and it needs this token to ask
//    (keeperCore.ts explains the rule)
//
// There is deliberately no way to list, iterate or serialise what is held.

interface HeldJwt {
  jwt: string;
  expiresAtMs: number;
}

const held = new Map<string, HeldJwt>(); // anchorWithdrawalId (hex) -> token

/** A token this close to expiry is treated as already expired, so a lookup is
 * never made with a credential that could lapse mid-request. */
const EXPIRY_SKEW_MS = 30_000;

/** Reads the `exp` claim WITHOUT verifying the signature — only used to know
 * when to stop using the token; the anchor is the one that authenticates it. */
export function jwtExpiryMs(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const exp = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Keeps `jwt` for this protection unless it is unusable (no readable expiry,
 * already expired) or older than the one already held. Returns whether it is held. */
export function holdAnchorJwt(hex: string, jwt: string, nowMs = Date.now()): boolean {
  const expiresAtMs = jwtExpiryMs(jwt);
  if (expiresAtMs === null || expiresAtMs - EXPIRY_SKEW_MS <= nowMs) return false;
  const existing = held.get(hex);
  if (existing && existing.expiresAtMs > expiresAtMs) return true; // keep the longer-lived token
  held.set(hex, { jwt, expiresAtMs });
  return true;
}

/** The held token if it is still usable, else null (and it is dropped). */
export function getAnchorJwt(hex: string, nowMs = Date.now()): string | null {
  const entry = held.get(hex);
  if (!entry) return null;
  if (entry.expiresAtMs - EXPIRY_SKEW_MS <= nowMs) {
    held.delete(hex);
    return null;
  }
  return entry.jwt;
}

/** Idempotent. Called at every terminal state. */
export function dropAnchorJwt(hex: string): void {
  held.delete(hex);
}

/** Replaces every occurrence of the held token in `text` — error messages that
 * might echo a credential must go through this before they are logged. */
export function redactAnchorJwt(hex: string, text: string): string {
  const entry = held.get(hex);
  return entry ? text.split(entry.jwt).join("[redacted]") : text;
}

/** Count only — never contents. For diagnostics and tests. */
export function heldAnchorJwtCount(): number {
  return held.size;
}

// Tokens that expire while their protection is still open would otherwise sit
// in memory until terminal; sweep them.
setInterval(() => {
  const now = Date.now();
  for (const [hex, e] of held) if (e.expiresAtMs - EXPIRY_SKEW_MS <= now) held.delete(hex);
}, 60_000).unref();
