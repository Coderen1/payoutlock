// Public, read-only routes — no session required, since `get_protection` is
// public on-chain data and the config values here are all non-secret
// (contract/asset addresses, network passphrase, RPC URL).
import { Router } from "express";
import { config } from "../../config.ts";
import { getProtection } from "../../contractClient.ts";
import { serverConfig } from "../config.ts";
import { rateLimit } from "../rateLimit.ts";
import { toJsonSafe } from "../json.ts";
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
