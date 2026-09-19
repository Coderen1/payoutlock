// Resumes the happyPath run from step 10 onward, against the SAME real
// protection already brought to Pending on testnet by happyPath.ts (avoids
// wasting a second GP collateral lock / User funding cycle for what is
// otherwise a continuous, already-proven flow).
import { randomBytes } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { sep10Auth, sep6Transaction } from "../anchorClient.ts";
import { getProtection, getDomainId, submitAttestation } from "../contractClient.ts";
import { signPayload } from "../sign.ts";
import { Horizon } from "@stellar/stellar-sdk";

const WITHDRAWAL_ID_STR = "sep_4wzy45durv4ltgmwf03h";
const WITHDRAW_AMOUNT_STROOPS = 10_000_000n;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  const userKeypair = Keypair.fromSecret(config.userSecret);
  const gpKeypair = Keypair.fromSecret(config.guaranteeProviderSecret);
  const relayerKeypair = Keypair.fromSecret(config.relayerSecret);
  const anchorWithdrawalId = new TextEncoder().encode(WITHDRAWAL_ID_STR);

  section("Pre-check: confirm real state is Pending before continuing");
  const recordBefore = await getProtection(anchorWithdrawalId);
  console.log("Current record:", recordBefore);
  if ((recordBefore as any).state?.tag !== "Pending") {
    throw new Error(`Expected Pending, got ${(recordBefore as any).state?.tag} — stopping.`);
  }

  section("10. Poll real Anchor /sep6/transaction?id= until completed");
  const jwt = await sep10Auth(userKeypair);
  let anchorStatus = "pending_anchor";
  let anchorTxFinal: any = null;
  for (let i = 0; i < 60 && anchorStatus !== "completed" && anchorStatus !== "error"; i++) {
    anchorTxFinal = await sep6Transaction(jwt, WITHDRAWAL_ID_STR);
    anchorStatus = anchorTxFinal.status;
    console.log(`  poll ${i + 1}: status=${anchorStatus}`);
    if (anchorStatus !== "completed" && anchorStatus !== "error") {
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  console.log("RAW completed transaction:", JSON.stringify(anchorTxFinal, null, 2));
  if (anchorStatus !== "completed") throw new Error(`Anchor never completed: ${anchorStatus}`);

  section("11. Attestor signs SETTLED, Relayer submits");
  const domainId = await getDomainId();
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
  const signed = signPayload({
    anchorWithdrawalId,
    user: userKeypair.publicKey(),
    amount: WITHDRAW_AMOUNT_STROOPS,
    asset: config.usdcSacId,
    status: "Settled",
    timestamp: settledPayload.timestamp,
    nonce: settledPayload.nonce,
    domainId,
  });
  const settledSubmit = await submitAttestation(relayerKeypair, settledPayload, signed.signature);
  console.log("SETTLED attestation tx hash:", settledSubmit.sendTransactionResponse?.hash);

  section("12. Final state + GP collateral balance");
  const finalRecord = await getProtection(anchorWithdrawalId);
  console.log("Final protection record:", finalRecord);

  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
  const gpAccount = await horizon.loadAccount(gpKeypair.publicKey());
  const gpFinalUsdc = gpAccount.balances.find((b: any) => b.asset_code === "USDC");
  console.log("GP final USDC balance:", gpFinalUsdc?.balance);

  console.log("\nHAPPY PATH COMPLETE (continuation).");
}

main().catch((e) => {
  console.error("CONTINUATION FAILED:", e);
  process.exit(1);
});
