import { useCallback, useEffect, useState } from "react";
import { checkWalletReadiness, type ReadinessResult } from "../lib/walletReadiness";

/** Live, chain-derived readiness — never a locally-tracked flag. After any
 * onboarding action, callers should `refresh()` and let THIS result (not the
 * action's own return value) decide what the UI shows next. */
export function useWalletReadiness(address: string | null, requiredUsdcDecimal: string) {
  const [result, setResult] = useState<ReadinessResult>({ status: "loading", xlmBalance: null, usdcBalance: null });

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      setResult(await checkWalletReadiness(address, requiredUsdcDecimal));
    } catch {
      // Transient network failure — keep showing the last known result
      // rather than flipping the whole gate to an error state.
    }
  }, [address, requiredUsdcDecimal]);

  useEffect(() => {
    setResult({ status: "loading", xlmBalance: null, usdcBalance: null });
    if (!address) return;
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, [address, refresh]);

  return { ...result, refresh };
}
