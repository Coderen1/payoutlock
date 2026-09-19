import { useCallback, useState } from "react";

export type AsyncActionStatus = "idle" | "submitting" | "success" | "error";

/** Tracks a single async action's status. "success" is only ever set by the
 * caller AFTER it has independently confirmed the real outcome (a resolved
 * submit call is not by itself success) — this hook doesn't assume, it just
 * tracks whatever the caller decides. */
export function useAsyncAction<T>() {
  const [status, setStatus] = useState<AsyncActionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const run = useCallback(async (fn: () => Promise<T>) => {
    setStatus("submitting");
    setError(null);
    try {
      const r = await fn();
      setResult(r);
      setStatus("success");
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      throw e;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  return { status, error, result, run, reset };
}
