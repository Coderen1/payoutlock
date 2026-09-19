// One-time (idempotent) bootstrap for the two Phase 4 demo-only identities:
// Demo Off-Ramp Account (receives principal payments in both scenarios) and
// Demo Refund Account (sends the simulated principal-return in Scenario B).
// Not part of the simulated correlation itself — this is plain account setup
// (trustline + real testnet USDC balance), same as what Phase 3 did for the
// User account. Requires DEMO_MODE=true, same as the rest of Phase 4.
import { Horizon, TransactionBuilder, Networks, Operation, Asset } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { sep10Auth } from "../anchorClient.ts";
import { demoOffRampKeypair, demoRefundKeypair } from "../demoOffRampSimulator.ts";

const HORIZON = new Horizon.Server("https://horizon-testnet.stellar.org");
const USDC = new Asset("USDC", config.usdcIssuer);

async function ensureTrustline(label: string, kp: ReturnType<typeof demoOffRampKeypair>) {
  const account = await HORIZON.loadAccount(kp.publicKey());
  const has = account.balances.some(
    (b: any) => b.asset_code === "USDC" && b.asset_issuer === config.usdcIssuer,
  );
  if (has) {
    console.log(`[SIMULATED] ${label}: USDC trustline already open`);
    return;
  }
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(30)
    .build();
  tx.sign(kp);
  await HORIZON.submitTransaction(tx);
  console.log(`[SIMULATED] ${label}: USDC trustline opened`);
}

async function fundWithAnchorDeposit(kp: ReturnType<typeof demoOffRampKeypair>, tryAmount: string) {
  const jwt = await sep10Auth(kp);
  const params = new URLSearchParams({ asset_code: "USDC", account: kp.publicKey(), amount: tryAmount });
  const depositRes = await fetch(`https://${config.anchorHomeDomain}/sep6/deposit?${params}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const deposit = await depositRes.json();
  await fetch(`https://${config.anchorHomeDomain}/sep6/tx/${deposit.id}/simulate-bank-transfer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: tryAmount }),
  });
  let status = "pending_anchor";
  for (let i = 0; i < 30 && status !== "completed" && status !== "error"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(`https://${config.anchorHomeDomain}/sep6/transaction?id=${deposit.id}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    status = (await res.json()).transaction.status;
  }
  if (status !== "completed") throw new Error(`Demo Refund Account bootstrap deposit did not complete: ${status}`);
}

async function main() {
  const offramp = demoOffRampKeypair();
  const refund = demoRefundKeypair();

  console.log(`[SIMULATED] Demo Off-Ramp Account: ${offramp.publicKey()}`);
  console.log(`[SIMULATED] Demo Refund Account:   ${refund.publicKey()}`);

  await ensureTrustline("Demo Off-Ramp Account", offramp);
  await ensureTrustline("Demo Refund Account", refund);

  const refundAccount = await HORIZON.loadAccount(refund.publicKey());
  const refundUsdc = refundAccount.balances.find((b: any) => b.asset_code === "USDC");
  const haveEnough = refundUsdc && Number(refundUsdc.balance) >= 2;
  if (haveEnough) {
    console.log(`[SIMULATED] Demo Refund Account already holds ${refundUsdc!.balance} USDC — skipping bootstrap deposit`);
  } else {
    console.log("[SIMULATED] Bootstrapping Demo Refund Account with real testnet USDC via anchor deposit (setup only, not part of the simulated refund path itself)...");
    // Real API finding (Phase 4): `amount` on /sep6/deposit is the source
    // FIAT (TRY) amount being deposited, not the target USDC amount, and has
    // a 50 TRY minimum — matches what Phase 3's happyPath.ts already used.
    await fundWithAnchorDeposit(refund, "100");
  }

  const finalOfframp = await HORIZON.loadAccount(offramp.publicKey());
  const finalRefund = await HORIZON.loadAccount(refund.publicKey());
  console.log("[SIMULATED] Demo Off-Ramp Account USDC balance:", finalOfframp.balances.find((b: any) => b.asset_code === "USDC")?.balance);
  console.log("[SIMULATED] Demo Refund Account USDC balance:", finalRefund.balances.find((b: any) => b.asset_code === "USDC")?.balance);
  console.log("[SIMULATED] demo setup complete.");
}

main().catch((e) => {
  console.error("DEMO SETUP FAILED:", e);
  process.exit(1);
});
