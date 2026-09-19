import "dotenv/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  rpcUrl: required("RPC_URL"),
  networkPassphrase: required("NETWORK_PASSPHRASE"),
  contractId: required("CONTRACT_ID"),
  usdcSacId: required("USDC_SAC_ID"),
  usdcIssuer: required("USDC_ISSUER"),
  contractWasmPath: path.resolve(__dirname, "..", required("CONTRACT_WASM_PATH")),

  // Ed25519 signing key only (Bölüm 6) — never submits a transaction.
  attestorSecret: required("ATTESTOR_SECRET"),
  // Separate Stellar account — submits transactions, never signs attestations.
  relayerSecret: required("RELAYER_SECRET"),

  // Phase 3 script/CLI-only demo identities (Bölüm 7 note: not the final web UX).
  userSecret: required("USER_SECRET"),
  guaranteeProviderSecret: required("GUARANTEE_PROVIDER_SECRET"),

  anchorHomeDomain: process.env.ANCHOR_HOME_DOMAIN ?? "tr-mock-anchor.fly.dev",
};
