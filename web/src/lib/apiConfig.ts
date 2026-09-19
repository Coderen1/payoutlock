// Fetches the backend's public, non-secret runtime config once and caches it
// (contract/asset addresses, network passphrase, RPC URL — none of this is
// sensitive; it's the same data the contract itself exposes on-chain).
export interface AppConfig {
  contractId: string;
  usdcSacId: string;
  usdcIssuer: string;
  rpcUrl: string;
  networkPassphrase: string;
  anchorHomeDomain: string;
  demoMode: boolean;
  maxProtectedAmountStroops: string;
}

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

let cached: AppConfig | null = null;
let inflight: Promise<AppConfig> | null = null;

export async function getAppConfig(): Promise<AppConfig> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch(`${API_URL}/api/config`)
      .then((r) => {
        if (!r.ok) throw new Error(`failed to load app config: ${r.status}`);
        return r.json();
      })
      .then((cfg: AppConfig) => {
        cached = cfg;
        return cfg;
      });
  }
  return inflight;
}
