// Classic Stellar USDC payments, built and signed in the browser via the
// connected wallet, submitted straight to Horizon. `Horizon.Server.submitTransaction`
// blocks until the transaction has a final ledger result (not just accepted
// for submission) — so `successful` here already reflects real finality, not
// a fire-and-forget send.
//
// Preconditions (account exists, XLM reserve, exact-issuer USDC trustline,
// sufficient USDC balance) are the WalletReadinessGate's job, NOT this
// function's — an earlier version tried to silently bundle `changeTrust`
// into this same transaction, which can't work: a freshly-opened trustline
// starts at 0 balance, so a payment in the same atomic transaction can only
// succeed if the account already held USDC. If a precondition is somehow
// unmet anyway (gate bypassed, race with another tab), the failure is
// translated to a plain-English message instead of surfacing a raw Horizon
// response.
import { Horizon, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { getAppConfig } from "./apiConfig";
import { signTransaction } from "./walletsKit";
import { friendlyHorizonError } from "./horizonErrors";

const HORIZON_URL = "https://horizon-testnet.stellar.org";

export async function sendUsdcPayment(params: {
  fromAddress: string;
  destination: string;
  amountDecimal: string;
  memoId: string;
}): Promise<{ hash: string; successful: boolean }> {
  const cfg = await getAppConfig();
  const horizon = new Horizon.Server(HORIZON_URL);
  const asset = new Asset("USDC", cfg.usdcIssuer);

  let account;
  try {
    account = await horizon.loadAccount(params.fromAddress);
  } catch (e) {
    if ((e as any)?.response?.status === 404) {
      throw new Error("Your wallet account does not exist on Testnet yet — fund it first.");
    }
    throw e;
  }

  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: params.destination, asset, amount: params.amountDecimal }))
    .addMemo(Memo.id(params.memoId))
    .setTimeout(60)
    .build();

  const { signedTxXdr } = await signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET, address: params.fromAddress });
  const signedTx = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
  try {
    const result = await horizon.submitTransaction(signedTx);
    return { hash: result.hash, successful: result.successful };
  } catch (e) {
    throw new Error(friendlyHorizonError(e));
  }
}
