import { getIdempotent, setIdempotent, deleteIdempotent } from "./store.ts";

/** An error with a stable `.code` (e.g. InsufficientProviderLiquidityError)
 * is treated as "structured" and rethrown as-is, uncollapsed to a plain
 * string, so the route handler can `instanceof`-check it and respond with
 * the specific status/fields it needs — a plain Error is still collapsed to
 * a generic 400-shaped `{error: message}` outcome. */
function hasStableCode(e: unknown): e is { code: string } {
  return typeof e === "object" && e !== null && typeof (e as any).code === "string";
}

/** Optional idempotency: if the caller passes `idempotencyKey`, a repeated
 * call with the same key returns the cached outcome instead of re-submitting
 * a second on-chain transaction. Skipped entirely when no key is given. */
export async function withIdempotency<T>(
  key: string | undefined,
  fn: () => Promise<T>,
): Promise<{ status: "done"; result: T } | { status: "pending" } | { status: "error"; error: string }> {
  if (!key) {
    try {
      return { status: "done", result: await fn() };
    } catch (e) {
      if (hasStableCode(e)) throw e;
      return { status: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }

  const existing = getIdempotent(key);
  if (existing?.status === "pending") return { status: "pending" };
  if (existing?.status === "done") return { status: "done", result: existing.result as T };
  if (existing?.status === "error") return { status: "error", error: existing.error ?? "unknown_error" };

  setIdempotent(key, { status: "pending", createdAt: Date.now() });
  try {
    const result = await fn();
    setIdempotent(key, { status: "done", result, createdAt: Date.now() });
    return { status: "done", result };
  } catch (e) {
    if (hasStableCode(e)) {
      // Not cached as a terminal idempotency failure — a liquidity problem
      // is expected to be transient (GP gets topped up), so the same
      // idempotency key must be retryable once liquidity is restored, not
      // stuck reporting "already in progress" forever.
      deleteIdempotent(key);
      throw e;
    }
    const error = e instanceof Error ? e.message : String(e);
    setIdempotent(key, { status: "error", error, createdAt: Date.now() });
    return { status: "error", error };
  }
}
