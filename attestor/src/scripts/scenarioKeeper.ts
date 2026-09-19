// Phase 6 / Keeper + slot-release verification against REAL Testnet, driven
// through the orchestration API exactly like the web app does.
//
// Proves, with no manual advance/expire call anywhere in this script:
//   1. The keeper moves a funded, never-settled protection Pending -> Grace ->
//      Claimable on its own (SIMULATED fiat payout failure — see
//      scenarioFailureClaim.ts). The only on-chain action this script takes as
//      the User is claim(), which is the point: it is the User's action.
//   2. After that protection is Claimed, the wallet's slot is free: a new
//      protection opens instead of hitting 429 (the old slot-leak bug).
//   3. The per-wallet cap really was 1 (a further open while one is active
//      gets 429) — so (2) is meaningful, not vacuous.
//   4. An unfunded protection is expired by the keeper after its funding
//      window, and that frees the slot too.
//
// Start the API in another terminal first, with a cap of 1 and quick timing:
//   DEMO_MODE=true MAX_ACTIVE_PROTECTIONS_PER_WALLET=1 KEEPER_INTERVAL_SECONDS=5 \
//   KEEPER_EXPIRE_BUFFER_SECONDS=5 npm run server
// then: npm run scenario-keeper        (API_URL defaults to http://localhost:8787)
import { Keypair } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { sendUserPaymentToDemoOffRamp } from "../demoOffRampSimulator.ts";
import { getProtection, claim } from "../contractClient.ts";
import { API, api, check, log, login, requireApi, sleep, stamp } from "./scenarioApi.ts";

const AMOUNT = "0.1"; // small on purpose: the GP's collateral for the claim is real Testnet USDC

const idBytes = (id: string) => new TextEncoder().encode(id);
const readState = async (id: string) => ((await getProtection(idBytes(id))) as any).state.tag as string;

/** Polls the chain (get_protection — the source of truth) until `target`,
 * recording every distinct state seen on the way. */
async function waitForState(id: string, target: string, timeoutMs: number, seen: string[]) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await readState(id);
    if (seen[seen.length - 1] !== s) {
      seen.push(s);
      log(`  ${id}: state -> ${s}`);
    }
    if (s === target) return;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs / 1000}s waiting for ${target} (last state ${s})`);
    await sleep(2000);
  }
}

async function main() {
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to run: set DEMO_MODE=true explicitly for this demo scenario.");
  await requireApi(true);

  const user = Keypair.fromSecret(config.userSecret);
  const token = await login(user);
  log(`logged in as ${user.publicKey().slice(0, 6)}…${user.publicKey().slice(-4)} against ${API}`);

  // ------------------------------------------------------------------ round 1
  log("ROUND 1 — [SIMULATED FIAT PAYOUT FAILURE]: funded, never settled; the keeper must advance it");
  const open1 = await api("/api/demo/failure/open", {
    token,
    body: { amountDecimal: AMOUNT, fundingDuration: 120, slaDuration: 15, graceDuration: 15 },
  });
  check(open1.status === 200, `round 1 opened (HTTP ${open1.status})`);
  const id1: string = open1.body.anchorWithdrawalId;

  const pay = await sendUserPaymentToDemoOffRamp({ userKeypair: user, amountDecimal: AMOUNT, memo: open1.body.memo });
  check(pay.successful, "user payment to the Demo Off-Ramp Account confirmed");

  let funded = false;
  for (let i = 0; i < 20 && !funded; i++) {
    const r = await api("/api/demo/check-funding", { token, body: { anchorWithdrawalId: id1 } });
    funded = r.body.funded === true || r.body.alreadyPastFunding === true;
    if (!funded) await sleep(2000);
  }
  check(funded, "funding verified and FUNDED attested (state Pending)");

  const seen1: string[] = [];
  log("no advance_to_grace / advance_to_claimable is called by this script — waiting on the keeper…");
  await waitForState(id1, "Claimable", 240_000, seen1);
  check(seen1.includes("Grace"), `keeper advanced through Grace (states seen: ${seen1.join(" -> ")})`);

  const claimTx = await claim(user, idBytes(id1));
  await waitForState(id1, "Claimed", 60_000, seen1);
  check(true, `user claimed the protection (tx ${claimTx.sendTransactionResponse?.hash})`);

  // ------------------------------------------------------------------ round 2
  log("ROUND 2 — the Claimed protection must have freed the wallet's slot");
  const open2 = await api("/api/demo/failure/open", {
    token,
    body: { amountDecimal: AMOUNT, fundingDuration: 30, slaDuration: 15, graceDuration: 15 },
  });
  check(open2.status === 200, `a new protection opens right after the claim (HTTP ${open2.status}; before the fix this was 429)`);
  const id2: string = open2.body.anchorWithdrawalId;

  const open3blocked = await api("/api/demo/failure/open", { token, body: { amountDecimal: AMOUNT } });
  check(
    open3blocked.status === 429 && open3blocked.body.error === "too_many_active_protections_for_wallet",
    "cap of 1 is really in effect (opening while one is active -> 429), so the check above is meaningful",
  );

  // ------------------------------------------------------------------ round 3
  log("ROUND 3 — the keeper must expire the never-funded protection and free the slot");
  const seen2: string[] = [];
  await waitForState(id2, "Expired", 180_000, seen2);
  check(true, "keeper expired the unfunded protection (no funding payment was ever sent)");

  const open4 = await api("/api/demo/failure/open", {
    token,
    body: { amountDecimal: AMOUNT, fundingDuration: 30, slaDuration: 15, graceDuration: 15 },
  });
  check(open4.status === 200, `a new protection opens after expiry (HTTP ${open4.status})`);
  const id4: string = open4.body.anchorWithdrawalId;

  log("cleanup — letting the last unfunded protection expire so no collateral stays locked");
  await waitForState(id4, "Expired", 180_000, []);

  console.log(`\nKEEPER + SLOT-RELEASE SCENARIO PASSED\n${JSON.stringify({ round1: { id: id1, states: seen1 }, round2: { id: id2, states: seen2 }, round4: { id: id4 } }, null, 2)}`);
}

main().catch((e) => {
  console.error(`\n${stamp()} KEEPER SCENARIO FAILED:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
