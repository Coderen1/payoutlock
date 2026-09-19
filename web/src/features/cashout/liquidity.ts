// Pure (no I/O) so it can be unit-tested; the fetch lives with its hook in useProviderLiquidity.ts.
/** Largest amount that can be protected right now: the product cap, or what the provider can back if that is less.
 * Either input may be unknown (null) — an unknown limit never blocks; the backend still checks both. */
export function effectiveMax(productCap: bigint | null, providerLiquidity: bigint | null): bigint | null {
  if (productCap === null) return providerLiquidity;
  if (providerLiquidity === null) return productCap;
  return productCap < providerLiquidity ? productCap : providerLiquidity;
}
