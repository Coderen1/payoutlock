// Real @creit.tech/stellar-wallets-kit v2.6.0 API (verified against the
// installed package's own .d.ts files, not assumed from memory/docs — this
// version exposes a STATIC class, not an instantiated one: `init()` once,
// then call the static methods directly).
// Real package finding (Phase 5): FreighterModule is NOT re-exported from
// the package root — it only exists under the `/modules/freighter` subpath
// export (confirmed against the installed package's own package.json
// `exports` map).
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";

let initialized = false;

export function initWalletsKit(): void {
  if (initialized) return;
  StellarWalletsKit.init({
    modules: [new FreighterModule()],
    network: Networks.TESTNET,
  });
  initialized = true;
}

export async function connectWallet(): Promise<{ address: string }> {
  initWalletsKit();
  // Opens the wallet-picker modal, sets the selected module, and returns the
  // connected address — this IS the real v2.6.0 replacement for the older
  // `openModal()` API other docs describe.
  return StellarWalletsKit.authModal();
}

export async function getWalletNetwork(): Promise<{ network: string; networkPassphrase: string }> {
  initWalletsKit();
  return StellarWalletsKit.getNetwork();
}

/** Matches the exact `signTransaction` shape @stellar/stellar-sdk's
 * `contract.Client` expects for its `signTransaction` option (confirmed
 * against the installed SDK's own type comment: "Matches signature of
 * signTransaction from Freighter") — so this can be passed straight through
 * with no adapter. */
export async function signTransaction(
  xdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress?: string }> {
  initWalletsKit();
  return StellarWalletsKit.signTransaction(xdr, opts);
}

/** SEP-53 message signing — signedMessage is normalized to a base64 string
 * by the Kit regardless of the underlying wallet's raw return type (verified
 * in the installed package's freighter.module.js). */
export async function signMessage(
  message: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedMessage: string; signerAddress?: string }> {
  initWalletsKit();
  return StellarWalletsKit.signMessage(message, opts);
}

export async function disconnectWallet(): Promise<void> {
  initWalletsKit();
  return StellarWalletsKit.disconnect();
}
