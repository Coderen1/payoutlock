// Replacement modules for the I/O layer in src/lib. Each is served in place of the real file (same URL, same exports)
// and works against window.__world (world.js). Anything the app must never call records itself so tests can prove it.
const W = "window.__world";

export const STUBS = {
  "lib/apiConfig.ts": `
    export const API_URL = "http://backend.test.invalid";
    export async function getAppConfig() { await ${W}.sleep(60); ${W}.rec("getAppConfig"); return ${W}.cfg; }
  `,
  "lib/walletsKit.ts": `
    export function initWalletsKit() {}
    export async function connectWallet() {
      ${W}.rec("connectWallet"); await ${W}.sleep();
      if (${W}.wallet.rejectNext) { const m = ${W}.wallet.rejectNext; ${W}.wallet.rejectNext = null; throw new Error(m); }
      return { address: ${W}.wallet.address };
    }
    export async function getWalletNetwork() { return { network: "TESTNET", networkPassphrase: ${W}.cfg.networkPassphrase }; }
    export async function signTransaction(xdr) { ${W}.rec("signTransaction"); await ${W}.sleep(); return { signedTxXdr: xdr }; }
    export async function signMessage() {
      ${W}.rec("signMessage"); await ${W}.sleep();
      if (${W}.wallet.rejectNext) { const m = ${W}.wallet.rejectNext; ${W}.wallet.rejectNext = null; throw new Error(m); }
      return { signedMessage: "c2lnbmVk" };
    }
    export async function disconnectWallet() {}
  `,
  "lib/api.ts": `
    const S = ${W};
    const openCommon = async (id, kind, amountStroops, durations) => {
      S.requireSession(); await S.sleep(500);
      S.maybeFail("open");
      const memo = String(100000 + (++S.n));
      S.memoToId.set(memo, id);
      S.make(id, { amount: amountStroops, createdAgo: 1, durations });
      return { txHash: "tx_open_" + id, memo, collateralAmountStroops: String(amountStroops), record: {}, anchorWithdrawalId: id, demoOffRampAddress: "GBTESTOFFRAMPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", destinationAddress: "GBTESTANCHORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" };
    };
    const toStroops = (d) => BigInt(Math.round(Number(d) * 1e7));
    const funding = (name) => async (id) => {
      S.rec(name); S.requireSession(); await S.sleep(200);
      const r = S.records.get(id);
      if (!r) throw new Error("protection_not_found_on_chain");
      if (r.state.tag !== "AwaitingFunding") return { alreadyPastFunding: true };
      if (!S.paid.has(id) || S.holdFunding) return { funded: false };
      S.setState(id, "Pending");
      return { funded: true, fundedTx: "tx_funded_" + id };
    };
    export async function getAuthChallenge() { S.rec("getAuthChallenge"); await S.sleep(80); return { nonce: "n" + (++S.n), message: "sign me", expiresAt: 0 }; }
    export async function verifyAuthChallenge(p) { S.rec("verifyAuthChallenge"); await S.sleep(80); return { token: "app-session-token", expiresAt: Math.floor(Date.now() / 1000) + S.sessionTtl, publicKey: p.publicKey }; }
    export async function openLiveProtection(p) { S.rec("openLiveProtection"); const id = p.anchorWithdrawalId; S.memoOwner = id; const out = await openCommon(id, "live", S.pendingAmount ?? 10000000n, { funding: p.fundingDuration, sla: p.slaDuration, grace: p.graceDuration }); return out; }
    export async function openDemoFailure(p) { S.rec("openDemoFailure"); return openCommon("demo_failure_" + (++S.n).toString(16).padStart(6, "0"), "failure", toStroops(p.amountDecimal), { funding: 180, sla: 30, grace: 30 }); }
    export async function openDemoRefund(p) { S.rec("openDemoRefund"); return openCommon("demo_refund_" + (++S.n).toString(16).padStart(6, "0"), "refund", toStroops(p.amountDecimal), { funding: 180, sla: 3600, grace: 1800 }); }
    export const checkLiveFunding = funding("checkLiveFunding");
    export const checkDemoFunding = funding("checkDemoFunding");
    export async function checkLiveSettlement(p) {
      S.rec("checkLiveSettlement"); S.requireSession(); await S.sleep(300);
      const r = S.records.get(p.anchorWithdrawalId);
      if (!r || !["Pending", "Grace"].includes(r.state.tag)) return { settled: false };
      if (S.anchor.get(p.anchorWithdrawalId) !== "completed") return { settled: false, anchorStatus: S.anchor.get(p.anchorWithdrawalId) };
      if (S.holdSettlement) return { settled: false, anchorStatus: "completed" }; // the anchor is done; the settlement attestation is still on its way
      S.setState(p.anchorWithdrawalId, "Settled");
      return { settled: true, settledTx: "tx_settled_" + p.anchorWithdrawalId };
    }
    export async function triggerDemoFailed() { S.rec("triggerDemoFailed"); return {}; }
    export async function triggerDemoRefund(id) {
      S.rec("triggerDemoRefund"); S.requireSession(); await S.sleep(700);
      S.setState(id, "Refunded");
      return { demoRefundTx: "tx_refund_" + id, refundedTx: "tx_refunded_" + id };
    }
  `,
  "lib/anchor.ts": `
    const S = ${W};
    export async function sep10Auth() { S.rec("sep10Auth"); await S.sleep(); S.maybeFail("sep10"); return "anchor-jwt"; }
    export async function sep6Withdraw(p) {
      S.rec("sep6Withdraw"); await S.sleep(); S.maybeFail("withdraw");
      const id = "sep_mock_" + (++S.n).toString(36) + "wd";
      S.pendingAmount = BigInt(Math.round(Number(p.amount) * 1e7));
      S.anchor.set(id, "pending_user_transfer_start");
      const memo = String(500000 + S.n);
      S.memoToId.set(memo, id);
      return { id, account_id: "GBTESTANCHORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", memo, memo_type: "id" };
    }
    export async function sep6Transaction(p) {
      S.rec("sep6Transaction"); await S.sleep(120);
      if (!S.anchor.has(p.id) && !S.records.has(p.id)) throw new Error("SEP-6 transaction lookup failed: 404");
      const memo = [...S.memoToId.entries()].find(([, v]) => v === p.id)?.[0] ?? "424242";
      return { status: S.anchor.get(p.id) ?? "pending_anchor", withdraw_anchor_account: "GBTESTANCHORAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", withdraw_memo: memo };
    }
  `,
  "lib/payments.ts": `
    const S = ${W};
    export async function sendUsdcPayment(p) {
      S.rec("sendUsdcPayment"); await S.sleep(600);
      if (S.wallet.rejectNext) { const m = S.wallet.rejectNext; S.wallet.rejectNext = null; throw new Error(m); }
      S.maybeFail("send");
      const id = S.memoToId.get(String(p.memoId));
      if (!id) throw new Error("Destination account not found on Testnet.");
      S.paid.add(id);
      return { hash: "tx_payment_" + id, successful: true };
    }
  `,
  "lib/contractRead.ts": `
    const S = ${W};
    export async function readProtection(id) { S.rec("readProtection"); await S.sleep(40); return S.records.get(id) ?? null; }
    export async function currentLedgerCloseTime() { return S.ledgerNow(); }
  `,
  "lib/contractWrite.ts": `
    const S = ${W};
    const forbidden = (name) => async () => { S.rec("FORBIDDEN:" + name); throw new Error(name + " must never be called from the product UI"); };
    export const advanceToGrace = forbidden("advanceToGrace");
    export const advanceToClaimable = forbidden("advanceToClaimable");
    export const expireUnfunded = forbidden("expireUnfunded");
    export async function claimProtection(address, id) {
      S.rec("claimProtection"); await S.sleep(500);
      if (S.wallet.rejectNext) { const m = S.wallet.rejectNext; S.wallet.rejectNext = null; throw new Error(m); }
      const r = S.records.get(id);
      if (!r || r.state.tag !== "Claimable") throw new Error("Error(Contract, #13)");
      S.setState(id, "Claimed");
      return { getTransactionResponse: { status: "SUCCESS" }, sendTransactionResponse: { hash: "tx_claim_" + id } };
    }
  `,
  "lib/walletReadiness.ts": `
    const S = ${W};
    export async function checkWalletReadiness() {
      await S.sleep(60);
      const st = S.readiness.status;
      return { status: st, xlmBalance: st === "no-account" ? null : S.readiness.xlm, usdcBalance: ["no-account", "low-reserve", "no-trustline"].includes(st) ? null : S.readiness.usdc };
    }
  `,
  "lib/onboarding.ts": `
    const S = ${W};
    const next = () => { const i = S.readiness.steps.indexOf(S.readiness.status); S.readiness.status = S.readiness.steps[Math.min(i + 1, S.readiness.steps.length - 1)]; };
    export async function fundWithFriendbot() { S.rec("fundWithFriendbot"); await S.sleep(700); next(); }
    export async function enableUsdcTrustline() { S.rec("enableUsdcTrustline"); await S.sleep(700); next(); return { hash: "tx_trust", successful: true }; }
    export async function getTestUsdcViaAnchorDeposit() { S.rec("getTestUsdcViaAnchorDeposit"); await S.sleep(1200); next(); }
  `,
};
