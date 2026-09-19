// Shared helpers for the API-driven scenario scripts (scenarioKeeper*.ts):
// a tiny HTTP client for the orchestration API, wallet login, and timestamped logging.
import { Keypair } from "@stellar/stellar-sdk";

export const API = process.env.API_URL ?? "http://localhost:8787";
const t0 = Date.now();
export const stamp = () => `[+${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s]`;
export const log = (m: string) => console.log(`${stamp()} ${m}`);
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  log(`✔ ${msg}`);
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as T };
}

/** App-level session (SEP-53 message signing against our own backend). */
export async function login(user: Keypair): Promise<string> {
  const ch = await api<{ nonce: string; message: string }>("/api/auth/challenge");
  // signMessage returns a Uint8Array (not a Buffer) — wrap it before base64-encoding.
  const signature = Buffer.from(user.signMessage(ch.body.message)).toString("base64");
  const v = await api<{ token: string }>("/api/auth/verify", {
    body: { nonce: ch.body.nonce, publicKey: user.publicKey(), signature },
  });
  if (v.status !== 200) throw new Error(`login failed: ${v.status} ${JSON.stringify(v.body)}`);
  return v.body.token;
}

export async function requireApi(needDemo: boolean) {
  const cfg = await api<{ demoMode: boolean }>("/api/config").catch(() => null);
  if (!cfg || cfg.status !== 200) throw new Error(`API not reachable at ${API} — start it first (see the header of the script).`);
  if (needDemo && !cfg.body.demoMode) throw new Error("API is running without DEMO_MODE=true — /api/demo/* is not mounted.");
}
