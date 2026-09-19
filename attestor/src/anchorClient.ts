// Real TR Mock Anchor client — SEP-1/SEP-10/SEP-6. Ported from the live-verified
// patterns proven earlier against this same anchor (SEP-10 challenge signing,
// GET /sep6/withdraw). No assumptions here that weren't empirically checked.
import { Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { config } from "./config.ts";

const ANCHOR = `https://${config.anchorHomeDomain}`;

export async function sep10Auth(keypair: Keypair): Promise<string> {
  const pub = keypair.publicKey();
  const challengeRes = await fetch(`${ANCHOR}/auth?account=${pub}`);
  const { transaction } = await challengeRes.json();
  const tx = TransactionBuilder.fromXDR(transaction, Networks.TESTNET);
  tx.sign(keypair);
  const tokenRes = await fetch(`${ANCHOR}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transaction: tx.toXDR() }),
  });
  const body = await tokenRes.json();
  if (!body.token) throw new Error(`SEP-10 auth failed: ${JSON.stringify(body)}`);
  return body.token;
}

export interface WithdrawResponse {
  id: string;
  account_id: string;
  memo: string;
  memo_type: string;
  min_amount?: number;
  fee_percent?: number;
  eta?: number;
  extra_info?: { message?: string; payment_uri?: string };
}

export async function sep6Withdraw(jwt: string, amount: string): Promise<WithdrawResponse> {
  const params = new URLSearchParams({
    asset_code: "USDC",
    funding_method: "bank_account",
    amount,
  });
  const res = await fetch(`${ANCHOR}/sep6/withdraw?${params.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SEP-6 withdraw failed: ${JSON.stringify(body)}`);
  return body;
}

export interface Sep6Transaction {
  id: string;
  kind: string;
  status: string;
  [key: string]: unknown;
}

export async function sep6Transaction(jwt: string, id: string): Promise<Sep6Transaction> {
  const res = await fetch(`${ANCHOR}/sep6/transaction?id=${id}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`SEP-6 transaction lookup failed: ${JSON.stringify(body)}`);
  return body.transaction;
}
