import { useEffect, useState } from "react";
import { currentLedgerCloseTime } from "../lib/contractRead";

/** Soroban's `now` (ledger close time) lags real wall-clock time — this
 * project found ~5-25s of lag empirically. Deadline-gated buttons
 * (advance_to_grace/advance_to_claimable) must compare against THIS, not
 * `Date.now()`, or they'll submit a transaction the contract still rejects. */
export function useLedgerNow(intervalMs = 5000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      currentLedgerCloseTime()
        .then((t) => !cancelled && setNow(t))
        .catch(() => {});
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
