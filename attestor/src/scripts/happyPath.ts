// Real end-to-end happy path (implementation plan Phase 3, item 6):
// SEP-10 -> real SEP-6 withdraw -> open_protection -> eventWatcher discovery
// -> real User payment -> independent on-chain funding verification ->
// FUNDED attestation -> Pending -> anchor completed -> SETTLED attestation
// -> Settled, collateral back to Guarantee Provider.
//
// State order is enforced structurally: FUNDED is signed and its
// submit_attestation call must succeed BEFORE this script ever looks at the
// anchor's `completed` status, let alone signs SETTLED.
import { randomBytes } from "node:crypto";
import { Keypair, TransactionBuilder, Networks, Operation, Asset, Memo, Horizon } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { sep10Auth, sep6Withdraw, sep6Transaction } from "../anchorClient.ts";
import { openProtection, getProtection, getDomainId, submitAttestation } from "../contractClient.ts";
import { pollNewProtections } from "../eventWatcher.ts";
import { verifyFunding } from "../fundingVerifier.ts";
import { signPayload } from "../sign.ts";

const HORIZON = new Horizon.Server("https://horizon-testnet.stellar.org");
const USDC = new Asset("USDC", config.usdcIssuer);
const WITHDRAW_AMOUNT = "1"; // USDC
const WITHDRAW_AMOUNT_STROOPS = 10_000_000n; // 1.0000000 USDC

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function ensureTrustline(kp: Keypair) {
  const account = await HORIZON.loadAccount(kp.publicKey());
  const has = account.balances.some(
    (b: any) => b.asset_code === "USDC" && b.asset_issuer === config.usdcIssuer,
  );
  if (has) return;
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .setTimeout(30)
    .build();
  tx.sign(kp);
  await HORIZON.submitTransaction(tx);
}

async function fundWithAnchorDeposit(kp: Keypair, jwt: string, tryAmount: string) {
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
  if (status !== "completed") throw new Error(`User funding deposit did not complete: ${status}`);
}

async function main() {
  const gpKeypair = Keypair.fromSecret(config.guaranteeProviderSecret);
  const userKeypair = Keypair.fromSecret(config.userSecret);
  const relayerKeypair = Keypair.fromSecret(config.relayerSecret);

  section("0. Pre-flight: User trustline + real Anchor deposit funding");
  await ensureTrustline(userKeypair);
  const userJwtForFunding = await sep10Auth(userKeypair);
  await fundWithAnchorDeposit(userKeypair, userJwtForFunding, "100");
  const userAccountAfterFunding = await HORIZON.loadAccount(userKeypair.publicKey());
  const userUsdcBalance = userAccountAfterFunding.balances.find((b: any) => b.asset_code === "USDC");
  console.log("User USDC balance after funding:", userUsdcBalance?.balance);

  section("1. SEP-10 auth (real, script/CLI User keypair — Bölüm 7 note: not final web UX)");
  const jwt = await sep10Auth(userKeypair);
  console.log("SEP-10 auth OK");

  section("2. Real GET /sep6/withdraw");
  const withdraw = await sep6Withdraw(jwt, WITHDRAW_AMOUNT);
  console.log("RAW withdraw response:", JSON.stringify(withdraw, null, 2));

  section("3. Real GET /sep6/transaction?id=... (pre-payment)");
  const prePaymentTx = await sep6Transaction(jwt, withdraw.id);
  console.log("RAW pre-payment transaction:", JSON.stringify(prePaymentTx, null, 2));

  const anchorWithdrawalId = new TextEncoder().encode(withdraw.id);
  const anchorMemo = new TextEncoder().encode(withdraw.memo);

  section("4. GP calls open_protection (real Testnet tx)");
  const openResult = await openProtection(gpKeypair, {
    guarantee_provider: gpKeypair.publicKey(),
    anchor_withdrawal_id: anchorWithdrawalId,
    anchor_memo: anchorMemo,
    user: userKeypair.publicKey(),
    collateral_amount: WITHDRAW_AMOUNT_STROOPS,
    funding_duration: 600n,
    sla_duration: 3600n,
    grace_duration: 1800n,
  });
  console.log("open_protection tx hash:", openResult.sendTransactionResponse?.hash ?? "(see result)");
  const recordAfterOpen = await getProtection(anchorWithdrawalId);
  console.log("Protection record after open:", recordAfterOpen);

  section("5. eventWatcher discovers + verifies via get_protection");
  const latestLedgerInfo = await new (await import("@stellar/stellar-sdk")).rpc.Server(config.rpcUrl).getLatestLedger();
  const discovered = await pollNewProtections(Math.max(1, latestLedgerInfo.sequence - 200));
  const mine = discovered.find((d) => d.anchorWithdrawalIdHex === Buffer.from(anchorWithdrawalId).toString("hex"));
  console.log("eventWatcher discovered our protection:", !!mine, "state:", (mine?.verifiedRecord as any)?.state);

  section("6. User sends real USDC payment to anchor destination + memo");
  const userAccount = await HORIZON.loadAccount(userKeypair.publicKey());
  const paymentTx = new TransactionBuilder(userAccount, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(
      Operation.payment({ destination: withdraw.account_id, asset: USDC, amount: WITHDRAW_AMOUNT }),
    )
    .addMemo(Memo.id(withdraw.memo))
    .setTimeout(60)
    .build();
  paymentTx.sign(userKeypair);
  const paymentResult = await HORIZON.submitTransaction(paymentTx);
  console.log("User -> Anchor payment tx hash:", paymentResult.hash, "successful:", paymentResult.successful);

  section("7. Independent on-chain funding verification (Horizon, not Anchor status)");
  let evidence = null;
  for (let i = 0; i < 15 && !evidence; i++) {
    evidence = await verifyFunding({
      destinationAccountId: withdraw.account_id,
      expectedMemo: withdraw.memo,
      expectedSenderAddress: userKeypair.publicKey(),
      expectedAmountStroops: WITHDRAW_AMOUNT_STROOPS,
      usdcIssuer: config.usdcIssuer,
      notBeforeUnixSeconds: Number((recordAfterOpen as any).created_at),
      anchorReportedStellarTxId: null,
    });
    if (!evidence) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!evidence) throw new Error("Funding NOT independently verified on-chain — refusing to sign FUNDED.");
  console.log("Funding evidence (independent Horizon verification):", evidence);

  section("8. Attestor signs FUNDED, Relayer submits");
  const domainId = await getDomainId();
  const fundedPayload = {
    anchor_withdrawal_id: anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: WITHDRAW_AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: { tag: "Funded" as const, values: undefined },
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    nonce: randomBytes(32),
    domain_id: domainId,
  };
  const signedFunded = signPayload({
    anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: WITHDRAW_AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: "Funded",
    timestamp: fundedPayload.timestamp,
    nonce: fundedPayload.nonce,
    domainId,
  });
  const fundedSubmit = await submitAttestation(relayerKeypair, fundedPayload, signedFunded.signature);
  console.log("FUNDED attestation tx hash:", fundedSubmit.sendTransactionResponse?.hash ?? "(see result)");

  section("9. Confirm state = Pending, deadlines set");
  const recordAfterFunded = await getProtection(anchorWithdrawalId);
  console.log("Protection record after FUNDED:", recordAfterFunded);
  if ((recordAfterFunded as any).state?.tag !== "Pending") {
    throw new Error("STOP: state is not Pending after FUNDED — refusing to continue to SETTLED.");
  }

  section("10. Poll real Anchor /sep6/transaction?id= until completed");
  let anchorStatus = "pending_anchor";
  let anchorTxFinal: any = null;
  for (let i = 0; i < 60 && anchorStatus !== "completed" && anchorStatus !== "error"; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    anchorTxFinal = await sep6Transaction(jwt, withdraw.id);
    anchorStatus = anchorTxFinal.status;
    console.log(`  poll ${i + 1}: status=${anchorStatus}`);
  }
  console.log("RAW completed transaction:", JSON.stringify(anchorTxFinal, null, 2));
  if (anchorStatus !== "completed") throw new Error(`Anchor never completed: ${anchorStatus}`);

  section("11. Attestor signs SETTLED, Relayer submits");
  const settledPayload = {
    anchor_withdrawal_id: anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: WITHDRAW_AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: { tag: "Settled" as const, values: undefined },
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    nonce: randomBytes(32),
    domain_id: domainId,
  };
  const signedSettled = signPayload({
    anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: WITHDRAW_AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: "Settled",
    timestamp: settledPayload.timestamp,
    nonce: settledPayload.nonce,
    domainId,
  });
  const settledSubmit = await submitAttestation(relayerKeypair, settledPayload, signedSettled.signature);
  console.log("SETTLED attestation tx hash:", settledSubmit.sendTransactionResponse?.hash ?? "(see result)");

  section("12. Final state + GP collateral balance");
  const finalRecord = await getProtection(anchorWithdrawalId);
  console.log("Final protection record:", finalRecord);
  const gpAccount = await HORIZON.loadAccount(gpKeypair.publicKey());
  const gpFinalUsdc = gpAccount.balances.find((b: any) => b.asset_code === "USDC");
  console.log("GP final USDC balance:", gpFinalUsdc?.balance);

  console.log("\nHAPPY PATH COMPLETE.");
}

main().catch((e) => {
  console.error("HAPPY PATH FAILED:", e);
  process.exit(1);
});
