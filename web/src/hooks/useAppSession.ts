import { useCallback } from "react";
import { connectWallet, signMessage, getWalletNetwork } from "../lib/walletsKit";
import { getAuthChallenge, verifyAuthChallenge } from "../lib/api";
import { setWalletAddress, setAppSession, clearSession, useSession } from "../lib/session";
import { getAppConfig } from "../lib/apiConfig";

export function useAppSession() {
  const session = useSession();

  const connect = useCallback(async () => {
    const { address } = await connectWallet();
    setWalletAddress(address);

    // Our OWN app-level session (SEP-53 message signing against our backend),
    // distinct from any anchor SEP-10 JWT obtained later for the live flow.
    const challenge = await getAuthChallenge();
    const { signedMessage } = await signMessage(challenge.message, { address });
    const { token, expiresAt } = await verifyAuthChallenge({
      nonce: challenge.nonce,
      publicKey: address,
      signature: signedMessage,
    });
    setAppSession(token, expiresAt);
    return address;
  }, []);

  const disconnect = useCallback(() => {
    clearSession();
  }, []);

  /** Returns null if on the right network, or a human message if not. */
  const checkNetwork = useCallback(async (): Promise<string | null> => {
    const [cfg, wallet] = await Promise.all([getAppConfig(), getWalletNetwork()]);
    if (wallet.networkPassphrase !== cfg.networkPassphrase) {
      return `Wallet is on "${wallet.network}" — PayoutLock runs on Stellar Testnet only. Switch networks in your wallet.`;
    }
    return null;
  }, []);

  return { session, connect, disconnect, checkNetwork };
}
