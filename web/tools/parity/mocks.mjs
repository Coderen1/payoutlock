// Deterministic network mocks so baseline and after builds see identical inputs.
export const WALLET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"; // valid-format public key (issuer id, public)
export const ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const CONFIG = {
  contractId: "CDLJDCOFCOZ7PPBO744NBOYWR5RYJ3UW2V5G2PULLY2FPUDFMYTFPLKF",
  usdcSacId: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
  usdcIssuer: ISSUER,
  rpcUrl: "https://rpc.parity.invalid",
  networkPassphrase: "Test SDF Network ; September 2015",
  anchorHomeDomain: "tr-mock-anchor.fly.dev",
  demoMode: true,
  maxProtectedAmountStroops: "20000000",
};
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};
const json = (route, status, body) =>
  route.fulfill({ status, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(body) });

function horizonAccount(kind) {
  const balances = [{ asset_type: "native", balance: kind === "low-reserve" ? "1.0000000" : "10000.0000000" }];
  if (kind === "insufficient")
    balances.unshift({ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: ISSUER, balance: "0.1000000" });
  if (kind === "ready")
    balances.unshift({ asset_type: "credit_alphanum4", asset_code: "USDC", asset_issuer: ISSUER, balance: "5.0000000" });
  return {
    _links: {}, id: WALLET, account_id: WALLET, sequence: "1", subentry_count: 0,
    thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    flags: {}, balances, signers: [], data: {},
  };
}

/** opts.config: "ok" | "abort"; opts.horizon: "no-account"|"low-reserve"|"no-trustline"|"insufficient"|"ready" */
export async function installMocks(page, opts = {}) {
  const { config = "ok", horizon = "no-account" } = opts;
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const host = url.hostname;
    if (req.method() === "OPTIONS" && host !== "localhost") return route.fulfill({ status: 204, headers: CORS });
    if (host === "localhost") {
      if (url.port === "8787") {
        if (url.pathname === "/api/config") {
          return config === "abort" ? route.abort("failed") : json(route, 200, CONFIG);
        }
        if (url.pathname === "/api/provider-liquidity") return json(route, 200, { availableStroops: "50000000" });
        if (url.pathname === "/api/demo/failure/open" || url.pathname === "/api/demo/refund/open") {
          return json(route, 200, {
            anchorWithdrawalId: "parity-withdrawal-0001",
            demoOffRampAddress: "GDXYO6FJCNXZEWGXD54GT76FGFYLOLSOGSOJLNQ6WGHCGEQPO7NTE73M",
            memo: "424242", collateralAmountStroops: "5000000", record: {},
          });
        }
        return json(route, 404, { error: "not_mocked" });
      }
      return route.continue(); // vite dev server itself
    }
    if (host === "horizon-testnet.stellar.org") {
      if (url.pathname.startsWith("/accounts/")) {
        return horizon === "no-account"
          ? json(route, 404, { type: "https://stellar.org/horizon-errors/not_found", title: "Resource Missing", status: 404 })
          : json(route, 200, horizonAccount(horizon));
      }
      return json(route, 404, {});
    }
    if (host === "tr-mock-anchor.fly.dev" && url.pathname === "/sep38/price") {
      // The product screens ask the anchor for an indicative quote; answer from a fixture, never the real anchor.
      const amount = Number(url.searchParams.get("sell_amount") ?? "1");
      return json(route, 200, { buy_amount: (48.54 * amount).toFixed(2), sell_amount: amount.toFixed(7), fee: { details: [{ description: "50 bps from the USD/TRY mid rate" }] } });
    }
    if (host === "rpc.parity.invalid") {
      const body = req.postDataJSON?.() ?? {};
      return json(route, 200, { jsonrpc: "2.0", id: body.id ?? 1, result: { id: "l", protocolVersion: 23, sequence: 1000, closeTime: "1758204000" } });
    }
    return route.abort("blockedbyclient"); // anything else external: never let it through
  });
}
