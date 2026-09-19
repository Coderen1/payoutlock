// Pre-flight check for the Guarantee Provider's configured USDC balance,
// run BEFORE any open_protection simulation is attempted. Without this, an
// undersized GP balance surfaces as a raw Soroban HostError ("resulting
// balance is not within allowed range") from deep inside transaction
// simulation — technically correct (the contract rejected it atomically,
// nothing was lost), but a poor API/UX experience. This turns that into a
// clean, structured 409 up front.
import { Horizon } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { decimalToStroops } from "./validation.ts";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export class InsufficientProviderLiquidityError extends Error {
  readonly code = "insufficient_provider_liquidity" as const;
  readonly requestedCollateralStroops: bigint;
  readonly availableProviderLiquidityStroops: bigint;

  constructor(requestedCollateralStroops: bigint, availableProviderLiquidityStroops: bigint) {
    super("insufficient_provider_liquidity");
    this.requestedCollateralStroops = requestedCollateralStroops;
    this.availableProviderLiquidityStroops = availableProviderLiquidityStroops;
  }
}

export async function getProviderUsdcBalanceStroops(providerAddress: string): Promise<bigint> {
  const horizon = new Horizon.Server(HORIZON_URL);
  const account = await horizon.loadAccount(providerAddress);
  const bal = (account.balances as any[]).find(
    (b) => b.asset_code === "USDC" && b.asset_issuer === config.usdcIssuer,
  );
  return bal ? decimalToStroops(bal.balance) : 0n;
}

/** Throws InsufficientProviderLiquidityError (never a generic Error) so
 * callers can distinguish this from every other open_protection failure
 * mode and respond with a structured, actionable error instead of a raw
 * simulation dump. */
export async function assertSufficientProviderLiquidity(
  providerAddress: string,
  requestedCollateralStroops: bigint,
): Promise<void> {
  const available = await getProviderUsdcBalanceStroops(providerAddress);
  if (available < requestedCollateralStroops) {
    throw new InsufficientProviderLiquidityError(requestedCollateralStroops, available);
  }
}
