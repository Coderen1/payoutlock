// Real TR Mock Anchor calls made DIRECTLY from the browser — confirmed safe
// in Phase 5 research: the anchor sends `access-control-allow-origin: *` on
// every relevant endpoint (stellar.toml, /auth, /sep6/*), including on the
// preflight OPTIONS for POST/Authorization requests, so no backend proxy is
// needed. The User's SEP-10 JWT lives only in this tab's memory — never
// logged, never persisted.
import { Transaction } from "@stellar/stellar-sdk";
import { signTransaction } from "./walletsKit";

export async function sep10Auth(params: { anchorHomeDomain: string; address: string; networkPassphrase: string }): Promise<string> {
  const base = `https://${params.anchorHomeDomain}`;
  const challengeRes = await fetch(`${base}/auth?account=${params.address}`);
  if (!challengeRes.ok) throw new Error(`SEP-10 challenge fetch failed: ${challengeRes.status}`);
  const { transaction } = await challengeRes.json();

  // Confirms the challenge is well-formed before asking the wallet to sign
  // it (fails loudly here rather than handing the wallet something bad).
  new Transaction(transaction, params.networkPassphrase);

  const { signedTxXdr } = await signTransaction(transaction, {
    networkPassphrase: params.networkPassphrase,
    address: params.address,
  });

  const tokenRes = await fetch(`${base}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: signedTxXdr }),
  });
  const body = await tokenRes.json();
  if (!tokenRes.ok || !body.token) throw new Error(`SEP-10 auth failed: ${body?.error ?? tokenRes.status}`);
  return body.token as string;
}

export interface WithdrawResponse {
  id: string;
  account_id: string;
  memo: string;
  memo_type: string;
  min_amount?: number;
  fee_percent?: number;
  eta?: number;
}

export async function sep6Withdraw(params: { anchorHomeDomain: string; jwt: string; amount: string }): Promise<WithdrawResponse> {
  const search = new URLSearchParams({ asset_code: "USDC", funding_method: "bank_account", amount: params.amount });
  const res = await fetch(`https://${params.anchorHomeDomain}/sep6/withdraw?${search.toString()}`, {
    headers: { Authorization: `Bearer ${params.jwt}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SEP-6 withdraw failed: ${body?.error ?? res.status}`);
  return body;
}

export async function sep6Transaction(params: { anchorHomeDomain: string; jwt: string; id: string }): Promise<{ status: string; [k: string]: unknown }> {
  const res = await fetch(`https://${params.anchorHomeDomain}/sep6/transaction?id=${params.id}`, {
    headers: { Authorization: `Bearer ${params.jwt}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SEP-6 transaction lookup failed: ${body?.error ?? res.status}`);
  return body.transaction;
}
