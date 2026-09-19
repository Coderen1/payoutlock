import { useEffect, useState } from "react";
import { API_URL } from "../../lib/apiConfig.ts";

/** What the provider can currently back, in stroops — or null when it can't be read. Advisory only: the open
 * routes' own `insufficient_provider_liquidity` answer stays the authority. */
export async function fetchProviderLiquidity(signal?: AbortSignal): Promise<bigint | null> {
  try {
    const res = await fetch(`${API_URL}/api/provider-liquidity`, { signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { availableStroops?: unknown };
    return typeof body.availableStroops === "string" && /^\d+$/.test(body.availableStroops) ? BigInt(body.availableStroops) : null;
  } catch {
    return null;
  }
}

/** How much the provider can back right now (stroops), refreshed every 20 s and silent like every poll here:
 * null until known, and again if it can't be read — in which case only the product cap applies. */
export function useProviderLiquidity(): bigint | null {
  const [liquidity, setLiquidity] = useState<bigint | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      fetchProviderLiquidity(controller.signal).then((value) => {
        if (!controller.signal.aborted) setLiquidity(value);
      });
    };
    load();
    const refresh = window.setInterval(load, 20_000);
    return () => {
      controller.abort();
      window.clearInterval(refresh);
    };
  }, []);
  return liquidity;
}
