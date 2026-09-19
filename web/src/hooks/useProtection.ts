import { useEffect, useRef, useState, useCallback } from "react";
import { readProtection, type ProtectionRecord } from "../lib/contractRead";

/** Polls `get_protection` directly against Soroban RPC — this is the ONLY
 * thing that decides what the UI shows as the current protection state.
 * Any backend response is treated as a hint to re-poll sooner, never as the
 * state itself. */
export function useProtection(anchorWithdrawalId: string | null, intervalMs = 4000) {
  const [record, setRecord] = useState<ProtectionRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!anchorWithdrawalId) return;
    setLoading(true);
    try {
      const r = await readProtection(anchorWithdrawalId);
      setRecord(r);
    } finally {
      setLoading(false);
    }
  }, [anchorWithdrawalId]);

  useEffect(() => {
    setRecord(null);
    if (!anchorWithdrawalId) return;
    refresh();
    timerRef.current = window.setInterval(refresh, intervalMs);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [anchorWithdrawalId, intervalMs, refresh]);

  return { record, loading, refresh };
}
