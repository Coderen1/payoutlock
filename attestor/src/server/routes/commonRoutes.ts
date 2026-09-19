// Public, read-only routes — no session required, since `get_protection` is
// public on-chain data and the config values here are all non-secret
// (contract/asset addresses, network passphrase, RPC URL).
import { Router } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../../config.ts";
import { getProtection } from "../../contractClient.ts";
import { serverConfig } from "../config.ts";
import { rateLimit } from "../rateLimit.ts";
import { toJsonSafe } from "../json.ts";
import { getProviderUsdcBalanceStroops } from "../providerLiquidity.ts";
import { isValidWithdrawalIdString } from "../validation.ts";

export const commonRoutes = Router();
commonRoutes.use(rateLimit);

commonRoutes.get("/config", (_req, res) => {
  res.json({
    contractId: config.contractId,
    usdcSacId: config.usdcSacId,
    usdcIssuer: config.usdcIssuer,
    rpcUrl: config.rpcUrl,
    networkPassphrase: config.networkPassphrase,
    anchorHomeDomain: config.anchorHomeDomain,
    demoMode: serverConfig.demoMode,
    maxProtectedAmountStroops: serverConfig.maxProtectedAmountStroops.toString(),
  });
});

commonRoutes.get("/protections/:anchorWithdrawalId", async (req, res) => {
  if (!isValidWithdrawalIdString(req.params.anchorWithdrawalId)) {
    res.status(400).json({ error: "invalid_anchor_withdrawal_id" });
    return;
  }
  const idBytes = new TextEncoder().encode(req.params.anchorWithdrawalId);
  const record = await getProtection(idBytes).catch(() => null);
  if (!record) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json({ record: toJsonSafe(record) });
});

// How much protection the Guarantee Provider can currently back — the same balance the open routes check before
// they return 409 insufficient_provider_liquidity. Read-only and advisory: it lets the UI stop an over-large amount
// early; the 409 stays the authority. Only the amount is exposed, never the provider's account or key. Cached for a
// few seconds so a busy page can't turn every keystroke into a Horizon call.
const LIQUIDITY_TTL_MS = 5_000;
let liquidityCache: { at: number; stroops: bigint } | null = null;

commonRoutes.get("/provider-liquidity", async (_req, res) => {
  try {
    if (!liquidityCache || Date.now() - liquidityCache.at > LIQUIDITY_TTL_MS) {
      const provider = Keypair.fromSecret(config.guaranteeProviderSecret).publicKey();
      liquidityCache = { at: Date.now(), stroops: await getProviderUsdcBalanceStroops(provider) };
    }
    res.json({ availableStroops: liquidityCache.stroops.toString() });
  } catch {
    res.status(503).json({ error: "provider_liquidity_unavailable" });
  }
});
