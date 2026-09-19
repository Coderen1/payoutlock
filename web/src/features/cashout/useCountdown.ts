import { useEffect, useState } from "react";

/** Whole seconds left until `at` (unix seconds, on the ledger clock), ticking every second between ledger samples.
 * null when there is no deadline or no ledger sample yet. Negative once it has passed. */
export function useCountdown(at: number | null, ledgerNow: number | null): number | null {
  const [wallNow, setWallNow] = useState(() => Date.now());
  const [sample, setSample] = useState<{ ledger: number; wall: number } | null>(null);

  // A new ledger sample arrives: remember when (on the wall clock) so we can extrapolate until the next one.
  // Adjusting state while rendering is React's supported way to derive state from a changed prop.
  if (ledgerNow != null && sample?.ledger !== ledgerNow) setSample({ ledger: ledgerNow, wall: wallNow });

  useEffect(() => {
    if (at == null) return;
    const id = window.setInterval(() => setWallNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [at]);

  if (at == null || !sample) return null;
  return Math.floor(at - (sample.ledger + (wallNow - sample.wall) / 1000));
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
