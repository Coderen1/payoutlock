import { dropAnchorJwt } from "./anchorCredentials.ts";
import { untrackProtection } from "./store.ts";

/** Everything that must happen when a protection reaches a terminal state, in
 * one idempotent call: the wallet's slot is freed and any anchor credentials
 * held for the protection are forgotten. Every terminal-state path ends here. */
export function releaseProtection(walletAddress: string, hex: string): void {
  untrackProtection(walletAddress, hex);
  dropAnchorJwt(hex);
}
