// Checks whether a connected wallet is actually able to send a USDC payment
// BEFORE any flow tries to build one — replaces the earlier approach of
// silently bundling `changeTrust` into the payment transaction, which was
// logically broken for its own stated purpose: a brand-new trustline starts
// at a 0 balance, so a payment in that same transaction could only ever
// succeed if the account already held USDC — impossible if the trustline
// didn't exist a moment ago. Onboarding needs to be its own explicit step.
import { Horizon } from "@stellar/stellar-sdk";
import { getAppConfig } from "./apiConfig";
import { decimalToStroops } from "./format";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export type ReadinessStatus =
  | "loading"
  | "no-account" // doesn't exist on Testnet yet (never funded with XLM)
  | "low-reserve" // exists, but not enough XLM to safely hold a trustline + pay fees
  | "no-trustline" // enough XLM, but no trustline for the EXACT configured USDC (code+issuer)
  | "insufficient-balance" // trustline exists, balance < required amount
  | "ready";

export interface ReadinessResult {
  status: ReadinessStatus;
  xlmBalance: string | null;
  usdcBalance: string | null;
}

// Minimum balance for a fresh account to hold one extra trustline entry is
// (2 + subentries) * base_reserve = 3 * 0.5 XLM = 1.5 XLM on current
// Stellar protocol parameters; 2 XLM leaves a small safety margin for fees
// without hardcoding protocol internals precisely.
const MIN_XLM_FOR_TRUSTLINE = 2;

export async function checkWalletReadiness(address: string, requiredUsdcDecimal: string): Promise<ReadinessResult> {
  const cfg = await getAppConfig();
  const horizon = new Horizon.Server(HORIZON_URL);

  let account;
  try {
    account = await horizon.loadAccount(address);
  } catch (e) {
    if ((e as any)?.response?.status === 404) {
      return { status: "no-account", xlmBalance: null, usdcBalance: null };
    }
    throw e;
  }

  const balances = account.balances as any[];
  const xlm = balances.find((b) => b.asset_type === "native")?.balance ?? "0";
  const usdcEntry = balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === cfg.usdcIssuer);
  const usdc = usdcEntry?.balance ?? null;

  if (Number(xlm) < MIN_XLM_FOR_TRUSTLINE && !usdcEntry) {
    return { status: "low-reserve", xlmBalance: xlm, usdcBalance: usdc };
  }
  if (!usdcEntry) {
    return { status: "no-trustline", xlmBalance: xlm, usdcBalance: usdc };
  }
  if (decimalToStroops(usdc!) < decimalToStroops(requiredUsdcDecimal)) {
    return { status: "insufficient-balance", xlmBalance: xlm, usdcBalance: usdc };
  }
  return { status: "ready", xlmBalance: xlm, usdcBalance: usdc };
}
