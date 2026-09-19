export interface Quote {
  /** TRY the anchor indicates for the amount, as a decimal string. */
  receive: string;
  /** TRY per 1 USDC, for display only. */
  rate: string;
  /** The anchor's spread in basis points, when it says so. */
  spreadBps: number | null;
}

/** Reads the fields we use out of a SEP-38 `/price` response. Returns null if it isn't usable. */
export function parseQuote(body: unknown): Quote | null {
  const b = body as { buy_amount?: unknown; sell_amount?: unknown; fee?: { details?: { description?: unknown }[] } } | null;
  if (!b || typeof b.buy_amount !== "string" || typeof b.sell_amount !== "string") return null;
  const buy = Number(b.buy_amount);
  const sell = Number(b.sell_amount);
  if (!(buy > 0) || !(sell > 0)) return null;
  const description = b.fee?.details?.map((d) => (typeof d.description === "string" ? d.description : "")).join(" ") ?? "";
  const bps = /(\d+(?:\.\d+)?)\s*bps/i.exec(description);
  return { receive: b.buy_amount, rate: (buy / sell).toFixed(2), spreadBps: bps ? Number(bps[1]) : null };
}

/** Indicative TRY quote from the anchor (SEP-38). It is public and needs no wallet, so it can be shown before
 * anyone connects. It is only ever an estimate — the anchor decides the final amount when it pays out. */
export async function fetchIndicativeQuote(params: { anchorHomeDomain: string; usdcIssuer: string; amount: string; signal?: AbortSignal }): Promise<Quote> {
  const q = new URLSearchParams({
    sell_asset: `stellar:USDC:${params.usdcIssuer}`,
    buy_asset: "iso4217:TRY",
    sell_amount: params.amount,
    context: "sep6",
  });
  const res = await fetch(`https://${params.anchorHomeDomain}/sep38/price?${q}`, { signal: params.signal });
  if (!res.ok) throw new Error(`quote_unavailable_${res.status}`);
  const quote = parseQuote(await res.json());
  if (!quote) throw new Error("quote_unusable");
  return quote;
}
