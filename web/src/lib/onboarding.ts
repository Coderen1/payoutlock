// The three explicit onboarding actions a wallet may need before it can pay
// in any flow: XLM (Friendbot), a USDC trustline, and actual test USDC
// (real TR Mock Anchor SEP-6 deposit). Each is its own step — see
// walletReadiness.ts for why they must not be bundled into the payment
// transaction itself.
import { Horizon, TransactionBuilder, Networks, Operation, Asset } from "@stellar/stellar-sdk";
import { getAppConfig } from "./apiConfig";
import { signTransaction } from "./walletsKit";
import { friendlyHorizonError } from "./horizonErrors";
import { sep10Auth } from "./anchor";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export async function fundWithFriendbot(address: string): Promise<void> {
  const res = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!res.ok) {
    throw new Error("Friendbot could not fund this account. Try again in a moment.");
  }
}

/** changeTrust-ONLY transaction, signed by the connected wallet. Resolves
 * only once Horizon reports a final ledger result. */
export async function enableUsdcTrustline(address: string): Promise<{ hash: string; successful: boolean }> {
  const cfg = await getAppConfig();
  const horizon = new Horizon.Server(HORIZON_URL);
  const asset = new Asset("USDC", cfg.usdcIssuer);
  const account = await horizon.loadAccount(address);

  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(60)
    .build();

  const { signedTxXdr } = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET, address });
  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  try {
    const result = await horizon.submitTransaction(signedTx);
    return { hash: result.hash, successful: result.successful };
  } catch (e) {
    throw new Error(friendlyHorizonError(e));
  }
}

// Empirical TR Mock Anchor SEP-6 deposit facts (established during earlier
// phases of this project, not assumed):
//  - `amount` is the source FIAT (TRY) amount, minimum 50, not a USDC amount
//  - 100 TRY yields roughly 2 USDC after the ~0.5% fee
//  - the deposit stays `pending_trust` forever if the destination has no
//    trustline yet — so the trustline MUST exist before this is called.
const ONBOARDING_DEPOSIT_TRY = "100";

/** Real Mock Anchor SEP-6 deposit, driven entirely from the browser (CORS
 * confirmed open on every endpoint used). The User's SEP-10 JWT for this
 * call is held only in this function's local scope. Refuses to start unless
 * the exact configured-USDC trustline already exists. */
export async function getTestUsdcViaAnchorDeposit(address: string): Promise<void> {
  const cfg = await getAppConfig();
  const horizon = new Horizon.Server(HORIZON_URL);

  const account = await horizon.loadAccount(address);
  const hasTrustline = (account.balances as any[]).some(
    (b) => b.asset_code === "USDC" && b.asset_issuer === cfg.usdcIssuer,
  );
  if (!hasTrustline) {
    throw new Error("Enable Test USDC first — the anchor cannot send USDC to a wallet without a trustline.");
  }

  const jwt = await sep10Auth({ anchorHomeDomain: cfg.anchorHomeDomain, address, networkPassphrase: cfg.networkPassphrase });
  const base = `https://${cfg.anchorHomeDomain}`;
  const headers = { Authorization: `Bearer ${jwt}` };

  const depositParams = new URLSearchParams({ asset_code: "USDC", account: address, amount: ONBOARDING_DEPOSIT_TRY });
  const depositRes = await fetch(`${base}/sep6/deposit?${depositParams}`, { headers });
  const deposit = await depositRes.json();
  if (!depositRes.ok || !deposit.id) throw new Error(`Anchor deposit request failed: ${deposit?.error ?? depositRes.status}`);

  const simRes = await fetch(`${base}/sep6/tx/${deposit.id}/simulate-bank-transfer`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: ONBOARDING_DEPOSIT_TRY }),
  });
  if (!simRes.ok) throw new Error("Anchor could not simulate the sandbox bank transfer.");

  let status = "pending_anchor";
  for (let i = 0; i < 30 && status !== "completed" && status !== "error"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`${base}/sep6/transaction?id=${deposit.id}`, { headers });
    status = (await res.json()).transaction?.status ?? status;
    if (status === "pending_trust") {
      throw new Error("Anchor is waiting for a USDC trustline on your wallet.");
    }
  }
  if (status !== "completed") throw new Error(`Test USDC deposit did not complete (status: ${status}).`);
}
