import { useEffect, useState } from "react";
import { fetchIndicativeQuote, type Quote } from "./quote.ts";

type Result = { status: "loading" | "ready" | "error"; quote: Quote | null; forAmount: string | null };

/** Indicative TRY quote for an amount. Debounced while typing, refreshed every 30 s, and — like every poll in
 * this app — silent: the previous quote stays on screen while a new one loads. */
export function useQuote(params: { amount: string; valid: boolean; anchorHomeDomain: string | undefined; usdcIssuer: string | undefined }): { status: "idle" | "loading" | "ready" | "error"; quote: Quote | null } {
  const { amount, valid, anchorHomeDomain, usdcIssuer } = params;
  const [result, setResult] = useState<Result>({ status: "loading", quote: null, forAmount: null });
  const active = valid && !!anchorHomeDomain && !!usdcIssuer;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const load = () => {
      fetchIndicativeQuote({ anchorHomeDomain: anchorHomeDomain!, usdcIssuer: usdcIssuer!, amount, signal: controller.signal })
        .then((quote) => setResult({ status: "ready", quote, forAmount: amount }))
        .catch((e) => {
          if (controller.signal.aborted) return;
          void e;
          setResult((prev) => ({ status: "error", quote: prev.quote, forAmount: amount }));
        });
    };
    const debounce = window.setTimeout(load, 350);
    const refresh = window.setInterval(load, 30_000);
    return () => {
      controller.abort();
      window.clearTimeout(debounce);
      window.clearInterval(refresh);
    };
  }, [active, amount, anchorHomeDomain, usdcIssuer]);

  if (!active) return { status: "idle", quote: null };
  const current = result.forAmount === amount;
  if (current && result.status === "ready") return { status: "ready", quote: result.quote };
  if (current && result.status === "error") return { status: "error", quote: null };
  return { status: "loading", quote: result.quote };
}
