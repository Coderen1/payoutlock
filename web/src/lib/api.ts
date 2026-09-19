// Thin wrapper around our own backend orchestration API. Every call here is
// either public/read-only or requires the app session token (never a wallet
// secret — those never leave the wallet extension).
import { API_URL } from "./apiConfig";
import { getSessionSnapshot } from "./session";
import { stroopsToDecimal } from "./format";

function stroopsToDecimalSafe(v: unknown): string | null {
  if (typeof v !== "string") return null;
  try {
    return stroopsToDecimal(BigInt(v));
  } catch {
    return null;
  }
}

/** Translates the backend's structured error codes into messages meant to
 * be shown directly to a User — never a raw Soroban simulation dump. Codes
 * not covered here fall back to the raw code, which is still better than an
 * unhandled diagnostic blob but not a polished message; add cases here as
 * more of them turn out to need one. */
function friendlyErrorMessage(body: any, status: number): string {
  if (body?.error === "insufficient_provider_liquidity") {
    const available = stroopsToDecimalSafe(body.availableProviderLiquidityStroops);
    return available != null
      ? `Protection liquidity is temporarily insufficient. Available: ${available} USDC.`
      : "Protection liquidity is temporarily insufficient.";
  }
  return body?.error ?? `request_failed_${status}`;
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const session = getSessionSnapshot();
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
  if (session.appSessionToken) headers.Authorization = `Bearer ${session.appSessionToken}`;
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyErrorMessage(body, res.status));
  }
  return body as T;
}

export function getAuthChallenge() {
  return request<{ nonce: string; message: string; expiresAt: number }>("/api/auth/challenge");
}

export function verifyAuthChallenge(params: { nonce: string; publicKey: string; signature: string }) {
  return request<{ token: string; expiresAt: number; publicKey: string }>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface OpenProtectionResult {
  txHash?: string;
  destinationAddress?: string;
  demoOffRampAddress?: string;
  memo: string;
  anchorWithdrawalId?: string;
  collateralAmountStroops: string;
  record: unknown;
}

export function openLiveProtection(params: {
  jwt: string;
  anchorWithdrawalId: string;
  fundingDuration?: number;
  slaDuration?: number;
  graceDuration?: number;
}) {
  return request<OpenProtectionResult>("/api/live/open-protection", { method: "POST", body: JSON.stringify(params) });
}

export function checkLiveFunding(anchorWithdrawalId: string) {
  return request<{ funded?: boolean; alreadyPastFunding?: boolean; fundedTx?: string; record?: unknown }>(
    "/api/live/check-funding",
    { method: "POST", body: JSON.stringify({ anchorWithdrawalId }) },
  );
}

export function checkLiveSettlement(params: { jwt: string; anchorWithdrawalId: string }) {
  return request<{ settled: boolean; settledTx?: string; anchorStatus?: string; record?: unknown }>(
    "/api/live/check-settlement",
    { method: "POST", body: JSON.stringify(params) },
  );
}

export function openDemoFailure(params: { amountDecimal: string }) {
  return request<OpenProtectionResult & { anchorWithdrawalId: string; demoOffRampAddress: string }>(
    "/api/demo/failure/open",
    { method: "POST", body: JSON.stringify(params) },
  );
}

export function openDemoRefund(params: { amountDecimal: string }) {
  return request<OpenProtectionResult & { anchorWithdrawalId: string; demoOffRampAddress: string }>(
    "/api/demo/refund/open",
    { method: "POST", body: JSON.stringify(params) },
  );
}

export function checkDemoFunding(anchorWithdrawalId: string) {
  return request<{ funded?: boolean; alreadyPastFunding?: boolean; fundedTx?: string; record?: unknown }>(
    "/api/demo/check-funding",
    { method: "POST", body: JSON.stringify({ anchorWithdrawalId }) },
  );
}

export function triggerDemoFailed(anchorWithdrawalId: string) {
  return request<{ failedTx?: string; record?: unknown }>("/api/demo/failure/trigger-failed", {
    method: "POST",
    body: JSON.stringify({ anchorWithdrawalId }),
  });
}

export function triggerDemoRefund(anchorWithdrawalId: string) {
  return request<{ demoRefundTx?: string; refundedTx?: string; refundEvidence?: unknown; record?: unknown }>(
    "/api/demo/refund/trigger-refund",
    { method: "POST", body: JSON.stringify({ anchorWithdrawalId }) },
  );
}
