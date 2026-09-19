// Phase 6 / LIVE protections against the REAL TR Mock Anchor and REAL Testnet, driven
// through the orchestration API like the web app. Pick a mode explicitly:
//
//   lifecycle  FREE. A live protection is opened and never funded. Proves the live
//              open route (which now keeps the anchor JWT in server memory) still
//              works, the per-wallet cap is enforced, and the keeper expires the
//              protection and frees the slot. The GP's collateral comes back on expiry.
//   settle     The real happy path: fund, wait for the anchor to complete, call
//              /api/live/check-settlement -> Settled. Proves the settlement route
//              (JWT refresh, drop on Settled) and that the slot is freed.
//              COST: the User pays AMOUNT to the anchor. GP: nothing (collateral returns).
//   guard      The scenario the keeper guard exists for: funded, then left alone as if the
//              tab were closed (nobody calls check-settlement). At the grace deadline the
//              keeper must NOT advance while the anchor says the payout is completed, and
//              may advance only while it is still pending. Cleans up like an operator would
//              (manual advance_to_claimable + the User's claim()).
//              COST: the User pays AMOUNT to the anchor; the GP's collateral (AMOUNT) goes
//              to the User on the claim. Refuses to run unless the GP holds >= 2 x AMOUNT.
//
// The mock anchor enforces a 1 USDC minimum withdrawal (its /sep6/info says 0.5).
//
// Start the API in another terminal first (quick keeper timing, cap of 1):
//   DEMO_MODE=true MAX_ACTIVE_PROTECTIONS_PER_WALLET=1 KEEPER_INTERVAL_SECONDS=5 \
//   KEEPER_EXPIRE_BUFFER_SECONDS=5 npm run server
// then: npm run scenario-keeper-live -- <lifecycle|settle|guard>     (API_URL defaults to http://localhost:8787)
import { Asset, Horizon, Keypair, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { config } from "../config.ts";
import { sep10Auth, sep6Transaction, sep6Withdraw } from "../anchorClient.ts";
import { advanceToClaimable, claim, getProtection } from "../contractClient.ts";
import { currentLedgerCloseTime } from "../ledgerTime.ts";
import { classifyAnchorStatus } from "../server/keeperCore.ts";
import { API, api, check, log, login, requireApi, sleep, stamp } from "./scenarioApi.ts";

const AMOUNT = "1"; // the anchor's enforced minimum withdrawal
const FUNDING_S = 180;
const SLA_S = 30;
const GRACE_S = 150; // long enough for the mock anchor to complete the payout while the protection is in Grace
const SETTLE_MARGIN_S = 45; // keeper tick (5 s) + ledger lag (~25 s) + submit, with headroom

const idBytes = (id: string) => new TextEncoder().encode(id);
const read = async (id: string) => (await getProtection(idBytes(id))) as any;

async function payAnchor(user: Keypair, destination: string, memoId: string): Promise<boolean> {
  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
  const account = await horizon.loadAccount(user.publicKey());
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination, asset: new Asset("USDC", config.usdcIssuer), amount: AMOUNT }))
    .addMemo(Memo.id(memoId))
    .setTimeout(60)
    .build();
  tx.sign(user);
  return (await horizon.submitTransaction(tx)).successful;
}

async function usdcBalance(publicKey: string): Promise<number> {
  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
  const account = await horizon.loadAccount(publicKey);
  return Number((account.balances as any[]).find((b) => b.asset_code === "USDC" && b.asset_issuer === config.usdcIssuer)?.balance ?? 0);
}

type Ctx = { user: Keypair; token: string; anchorJwt: string };

async function openLive(ctx: Ctx, funding: number, sla: number, grace: number) {
  const w = await sep6Withdraw(ctx.anchorJwt, AMOUNT);
  const open = await api("/api/live/open-protection", {
    token: ctx.token,
    body: { jwt: ctx.anchorJwt, anchorWithdrawalId: w.id, fundingDuration: funding, slaDuration: sla, graceDuration: grace },
  });
  check(open.status === 200, `LIVE protection opened for anchor withdrawal ${w.id} (HTTP ${open.status})`);
  return w;
}

async function payAndFund(ctx: Ctx, w: { id: string; account_id: string; memo: string }) {
  check(await payAnchor(ctx.user, w.account_id, w.memo), `user paid ${AMOUNT} USDC to the anchor`);
  let funded = false;
  for (let i = 0; i < 20 && !funded; i++) {
    const r = await api("/api/live/check-funding", { token: ctx.token, body: { anchorWithdrawalId: w.id } });
    funded = r.body.funded === true || r.body.alreadyPastFunding === true;
    if (!funded) await sleep(2000);
  }
  check(funded, "funding verified and FUNDED attested (state Pending)");
}

/** The open route checks the per-wallet cap BEFORE it looks the withdrawal up at the
 * anchor, so an id that doesn't exist answers 429 when the cap is full and a 400
 * (anchor lookup failed) when it is not — a free way to see the slot state. */
async function slotIsFull(ctx: Ctx): Promise<boolean> {
  const r = await api("/api/live/open-protection", { token: ctx.token, body: { jwt: ctx.anchorJwt, anchorWithdrawalId: "slot-probe-does-not-exist" } });
  return r.status === 429;
}

async function waitFor(id: string, target: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  for (;;) {
    const s = (await read(id)).state.tag as string;
    if (s !== last) {
      last = s;
      log(`  chain state -> ${s}`);
    }
    if (s === target) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${target} (last state ${s})`);
    await sleep(2000);
  }
}

async function lifecycle(ctx: Ctx) {
  log("MODE lifecycle — never funded; the keeper must expire it and free the slot");
  const w = await openLive(ctx, 30, 30, 30);
  check(await slotIsFull(ctx), "cap of 1 is in effect while it is open (a further open -> 429)");
  await waitFor(w.id, "Expired", 150_000);
  check(true, "keeper expired the never-funded LIVE protection");
  check(!(await slotIsFull(ctx)), "slot freed after expiry (a further open no longer -> 429)");
}

async function settle(ctx: Ctx) {
  log("MODE settle — the real happy path");
  const w = await openLive(ctx, 180, 3600, 1800);
  await payAndFund(ctx, w);
  let status = "";
  for (let i = 0; i < 80 && status !== "completed"; i++) {
    status = (await sep6Transaction(ctx.anchorJwt, w.id)).status;
    if (status !== "completed") await sleep(3000);
  }
  check(status === "completed", "the anchor completed the payout");
  const s = await api("/api/live/check-settlement", { token: ctx.token, body: { jwt: ctx.anchorJwt, anchorWithdrawalId: w.id } });
  check(s.status === 200 && s.body.settled === true, `check-settlement settled it (HTTP ${s.status}, tx ${s.body.settledTx})`);
  check((await read(w.id)).state.tag === "Settled", "chain state Settled");
  check(!(await slotIsFull(ctx)), "slot freed after Settled");
}

async function guard(ctx: Ctx) {
  log("MODE guard — funded, then left alone (as if the tab were closed)");
  const gp = await usdcBalance(Keypair.fromSecret(config.guaranteeProviderSecret).publicKey());
  if (gp < 2 * Number(AMOUNT)) {
    throw new Error(
      `refusing to run: the Guarantee Provider holds ${gp} USDC and this scenario ends in a claim that pays out ${AMOUNT}, ` +
        `which would leave it with ${(gp - Number(AMOUNT)).toFixed(2)}. Top the GP up to at least ${2 * Number(AMOUNT)} USDC first.`,
    );
  }
  const w = await openLive(ctx, FUNDING_S, SLA_S, GRACE_S);
  await payAndFund(ctx, w);

  const fundedRecord = await read(w.id);
  const graceDeadline = Number(fundedRecord.grace_deadline);
  log(`grace deadline (ledger time) ${graceDeadline}; from here this script only OBSERVES — no check-settlement, no advance, no expire`);

  const states: string[] = [];
  const anchorSeen: { status: string; ledger: number }[] = [];
  let ledgerNow = await currentLedgerCloseTime();
  while (ledgerNow <= graceDeadline + SETTLE_MARGIN_S) {
    const state = (await read(w.id)).state.tag as string;
    if (states[states.length - 1] !== state) {
      states.push(state);
      log(`  chain state -> ${state}`);
    }
    if (state === "Claimable") break;
    const status = (await sep6Transaction(ctx.anchorJwt, w.id)).status;
    if (anchorSeen[anchorSeen.length - 1]?.status !== status) {
      anchorSeen.push({ status, ledger: ledgerNow });
      log(`  anchor status -> ${status} (${classifyAnchorStatus(status)}), ${Math.max(0, graceDeadline - ledgerNow)}s before the grace deadline`);
    }
    await sleep(3000);
    ledgerNow = await currentLedgerCloseTime();
  }
  check(states.includes("Grace"), `keeper advanced Pending -> Grace on its own (states seen: ${states.join(" -> ")})`);

  const beforeDeadline = anchorSeen.filter((a) => a.ledger <= graceDeadline);
  const statusAtDeadline = beforeDeadline[beforeDeadline.length - 1]?.status ?? anchorSeen[0]?.status ?? "(never observed)";
  const verdict = classifyAnchorStatus(statusAtDeadline);
  const finalState = (await read(w.id)).state.tag as string;
  log(`anchor status at the grace deadline: "${statusAtDeadline}" (${verdict}); chain state now: ${finalState}`);
  if (verdict === "resolved") {
    check(finalState === "Grace", "GUARD HELD: the anchor reported the payout completed, so the keeper left the protection in Grace");
    log("(a SETTLED attestation is refused after the grace deadline, so this protection is now stuck exactly as documented)");
  } else if (verdict === "unresolved") {
    check(finalState === "Claimable", "the anchor still reported the payout unresolved, so the keeper advanced to Claimable");
  } else {
    throw new Error(`inconclusive: unexpected anchor status "${statusAtDeadline}"`);
  }

  log("CLEANUP — resolving the protection like an operator/User would, so no collateral stays locked");
  if (finalState === "Grace") {
    const adv = await advanceToClaimable(Keypair.fromSecret(config.relayerSecret), idBytes(w.id)); // the /developer manual control
    log(`  manual advance_to_claimable (tx ${adv.sendTransactionResponse?.hash})`);
  }
  const claimed = await claim(ctx.user, idBytes(w.id));
  check(true, `User claimed (tx ${claimed.sendTransactionResponse?.hash})`);
  await waitFor(w.id, "Claimed", 30_000);
}

const MODES = { lifecycle, settle, guard } as const;

async function main() {
  const mode = process.argv[2] as keyof typeof MODES | undefined;
  if (!mode || !(mode in MODES)) throw new Error(`usage: npm run scenario-keeper-live -- <${Object.keys(MODES).join("|")}>  (see the header of this file for what each costs)`);
  if (process.env.DEMO_MODE !== "true") throw new Error("Refusing to run: set DEMO_MODE=true explicitly for this scenario.");
  await requireApi(false);

  const user = Keypair.fromSecret(config.userSecret);
  const token = await login(user);
  const anchorJwt = await sep10Auth(user); // held here only, like the browser tab would
  log(`logged in as ${user.publicKey().slice(0, 6)}…${user.publicKey().slice(-4)}; SEP-10 done against ${config.anchorHomeDomain} (${API})`);
  await MODES[mode]({ user, token, anchorJwt });
  console.log(`\nLIVE KEEPER SCENARIO "${mode}" PASSED`);
}

main().catch((e) => {
  console.error(`\n${stamp()} LIVE KEEPER SCENARIO FAILED:`, e instanceof Error ? e.message : e);
  process.exit(1);
});
