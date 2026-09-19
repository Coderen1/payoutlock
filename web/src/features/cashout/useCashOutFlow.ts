// The whole cash-out flow, in one hook, on top of the proven wallet / anchor / chain code in lib/ and hooks/
// (none of which is edited). Three rules from the design shape it:
//   - chain state (useProtection -> get_protection) is the only source of truth for what the person sees;
//     everything this hook holds in memory is evidence or a convenience, and is safe to lose on refresh;
//   - the anchor JWT and the app session live in memory only; the browser remembers a {flow, reference} pair, nothing else;
//   - this hook never advances a protection's state. The backend keeper moves Pending -> Grace -> Claimable in the
//     background; the only on-chain action a person takes is Claim Protection, and only when the chain says Claimable.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppSession } from "../../hooks/useAppSession";
import { useLedgerNow } from "../../hooks/useLedgerNow";
import { useProtection } from "../../hooks/useProtection";
import { getAppConfig } from "../../lib/apiConfig";
import { sep10Auth, sep6Transaction, sep6Withdraw } from "../../lib/anchor";
import {
  checkDemoFunding,
  checkLiveFunding,
  checkLiveSettlement,
  openDemoFailure,
  openDemoRefund,
  openLiveProtection,
  triggerDemoRefund,
} from "../../lib/api";
import { claimProtection } from "../../lib/contractWrite";
import { readProtection } from "../../lib/contractRead";
import { stroopsToDecimal } from "../../lib/format";
import { sendUsdcPayment } from "../../lib/payments";
import { friendlyError, isSessionError, type FriendlyError } from "./errors.ts";
import { LIVE_DURATIONS, scenarioFromReference, usesAnchor, type FlowMode, type Scenario } from "./scenario.ts";
import { clearLastCashOut, saveLastCashOut } from "./storage.ts";
import { deriveView, isTerminalTag, type View } from "./view.ts";

/** Public receipts collected as the flow goes. Lost on refresh — the chain itself is not. */
export interface Evidence {
  openTx?: string;
  paymentTx?: string;
  fundedTx?: string;
  settledTx?: string;
  claimTx?: string;
  refundTx?: string;
}

interface Destination {
  account: string;
  memo: string;
}

interface Scoped {
  ref: string | null;
  evidence: Evidence;
  destination: Destination | null;
  paymentSent: boolean;
  fundingCheck: "unknown" | "none" | "found";
  anchorStatus: string | null;
}
const emptyScoped = (ref: string | null): Scoped => ({ ref, evidence: {}, destination: null, paymentSent: false, fundingCheck: "unknown", anchorStatus: null });

export type StartStep = "sign-in" | "secure";
export type Busy = "connecting" | "sending" | "claiming" | "refunding" | "anchor-sign-in" | null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useCashOutFlow({ mode, reference, onStarted }: { mode: FlowMode; reference: string | null; onStarted: (reference: string) => void }) {
  const { session, connect: connectWallet, disconnect, checkNetwork } = useAppSession();
  const address = session.address;
  const { record, loading: recordLoading, refresh } = useProtection(reference);
  const ledgerNow = useLedgerNow();

  // ---- session ------------------------------------------------------------------------------------------------
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [connectError, setConnectError] = useState<FriendlyError | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const signedIn = !!address && !!session.appSessionToken && !needsSignIn;

  const expiresAt = session.appSessionExpiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(() => setNeedsSignIn(true), Math.max(0, expiresAt * 1000 - Date.now()));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  /** Any call that answers "your session is gone" flips the app into "sign in again" instead of failing loudly. */
  const guardSession = useCallback((e: unknown) => {
    if (isSessionError(e)) setNeedsSignIn(true);
    return e;
  }, []);

  const connect = useCallback(async () => {
    setConnectError(null);
    setBusy("connecting");
    try {
      await connectWallet();
      setNeedsSignIn(false);
      setNetworkWarning(await checkNetwork().catch(() => null));
    } catch (e) {
      setConnectError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }, [connectWallet, checkNetwork]);

  // ---- what this browser knows --------------------------------------------------------------------------------
  const [chosen, setChosen] = useState<Scenario>(mode === "live" ? "live" : "success");
  const scenario: Scenario = reference ? scenarioFromReference(reference, mode) : chosen;

  // Everything that belongs to ONE cash out is kept together and tagged with its reference. Opening a different
  // cash out (a link, back/forward) reads a clean slate: nothing learned about one — that no payment exists, where
  // to send it, its receipts — may ever carry over to another. The anchor sign-in is per account, so it is shared.
  const [scoped, setScoped] = useState<Scoped>(emptyScoped(null));
  const mine = scoped.ref === reference ? scoped : emptyScoped(reference);
  const { evidence, destination, paymentSent, fundingCheck, anchorStatus } = mine;
  const patch = useCallback((forRef: string | null, change: (s: Scoped) => Partial<Scoped>) => {
    setScoped((prev) => {
      const base = prev.ref === forRef ? prev : emptyScoped(forRef);
      return { ...base, ...change(base), ref: forRef };
    });
  }, []);
  const [jwt, setJwt] = useState<string | null>(null);
  const [starting, setStarting] = useState<StartStep | null>(null);
  const [startError, setStartError] = useState<FriendlyError | null>(null);
  const [actionError, setActionError] = useState<FriendlyError | null>(null);

  const tag = record?.state.tag;
  const terminal = isTerminalTag(tag);

  // The one thing remembered across a refresh: where the person was.
  useEffect(() => {
    if (reference) saveLastCashOut({ flow: mode, reference });
  }, [mode, reference]);

  // ---- starting -----------------------------------------------------------------------------------------------
  const start = useCallback(
    async (amount: string, which: Scenario) => {
      setStartError(null);
      setActionError(null);
      if (!signedIn || !address) {
        setNeedsSignIn(true);
        setStartError(friendlyError(new Error("invalid_or_expired_session")));
        return;
      }
      try {
        let id: string;
        let dest: Destination;
        let openTx: string | undefined;
        if (usesAnchor(which)) {
          setStarting("sign-in");
          const cfg = await getAppConfig();
          const token = await sep10Auth({ anchorHomeDomain: cfg.anchorHomeDomain, address, networkPassphrase: cfg.networkPassphrase });
          setJwt(token);
          const withdrawal = await sep6Withdraw({ anchorHomeDomain: cfg.anchorHomeDomain, jwt: token, amount });
          setStarting("secure");
          const opened = await openLiveProtection({
            jwt: token,
            anchorWithdrawalId: withdrawal.id,
            fundingDuration: LIVE_DURATIONS.funding,
            slaDuration: LIVE_DURATIONS.sla,
            graceDuration: LIVE_DURATIONS.grace,
          });
          id = withdrawal.id;
          dest = { account: withdrawal.account_id, memo: withdrawal.memo };
          openTx = opened.txHash;
        } else {
          setStarting("secure");
          const opened = await (which === "failure" ? openDemoFailure : openDemoRefund)({ amountDecimal: amount });
          id = opened.anchorWithdrawalId;
          dest = { account: opened.demoOffRampAddress, memo: opened.memo };
          openTx = opened.txHash;
        }
        setScoped({ ref: id, evidence: { openTx }, destination: dest, paymentSent: false, fundingCheck: "none", anchorStatus: null });
        onStarted(id);
      } catch (e) {
        setStartError(friendlyError(guardSession(e)));
      } finally {
        setStarting(null);
      }
    },
    [signedIn, address, onStarted, guardSession],
  );

  // ---- paying ---------------------------------------------------------------------------------------------------
  const checkFundingOnce = useCallback(async (): Promise<boolean> => {
    if (!reference) return false;
    const r = await (usesAnchor(scenario) ? checkLiveFunding : checkDemoFunding)(reference);
    if (r.fundedTx) patch(reference, (s) => ({ evidence: { ...s.evidence, fundedTx: r.fundedTx } }));
    return !!(r.funded || r.alreadyPastFunding);
  }, [reference, scenario, patch]);

  const send = useCallback(async () => {
    if (!address || !destination || !record) return;
    setActionError(null);
    setBusy("sending");
    try {
      const paid = await sendUsdcPayment({
        fromAddress: address,
        destination: destination.account,
        amountDecimal: stroopsToDecimal(record.collateral_amount),
        memoId: destination.memo,
      });
      if (!paid.successful) throw new Error("Payment did not succeed on-chain.");
      patch(reference, (s) => ({ evidence: { ...s.evidence, paymentTx: paid.hash }, paymentSent: true }));
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }, [address, destination, record, reference, patch]);

  // A resumed, still-unfunded protection: before offering "Send", ask the server whether a payment already exists,
  // so a refresh can never lead to paying twice.
  useEffect(() => {
    if (tag !== "AwaitingFunding" || paymentSent || fundingCheck !== "unknown" || !signedIn) return;
    let alive = true;
    const run = async () => {
      try {
        const found = await checkFundingOnce();
        if (alive) patch(reference, () => ({ fundingCheck: found ? "found" : "none" }));
      } catch (e) {
        guardSession(e);
        if (alive) patch(reference, () => ({ fundingCheck: "none" }));
      }
    };
    void run();
    return () => {
      alive = false;
    };
  }, [tag, paymentSent, fundingCheck, signedIn, checkFundingOnce, guardSession, patch, reference]);

  // After a payment (or once a payment is known to exist): keep asking until the chain moves on. Idempotent on the
  // server; the backend's own sweep does the same, so this only makes it quicker.
  const paymentKnown = paymentSent || fundingCheck === "found";
  useEffect(() => {
    if (tag !== "AwaitingFunding" || !paymentKnown || !signedIn) return;
    let inFlight = false;
    const tick = () => {
      if (inFlight) return;
      inFlight = true;
      checkFundingOnce()
        .then(() => refresh())
        .catch(guardSession)
        .finally(() => {
          inFlight = false;
        });
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => window.clearInterval(id);
  }, [tag, paymentKnown, signedIn, checkFundingOnce, refresh, guardSession]);

  // ---- the anchor: payout status, and confirming a completed payout automatically ------------------------------
  const watching = usesAnchor(scenario) && !!jwt && !!reference && (tag === "Pending" || tag === "Grace");
  const settling = useRef(false);
  useEffect(() => {
    if (!watching || !reference || !jwt) return;
    let alive = true;
    const poll = async () => {
      try {
        const cfg = await getAppConfig();
        const tx = await sep6Transaction({ anchorHomeDomain: cfg.anchorHomeDomain, jwt, id: reference });
        if (!alive) return;
        patch(reference, () => ({ anchorStatus: tx.status }));
        // The status is only ever a hint for display. What settles a protection is the backend re-checking with the
        // anchor itself — this just asks it to, as soon as the anchor says the payout is done.
        if (tx.status === "completed" && !settling.current && signedIn) {
          settling.current = true;
          try {
            const settled = await checkLiveSettlement({ jwt, anchorWithdrawalId: reference });
            if (settled.settledTx) patch(reference, (s) => ({ evidence: { ...s.evidence, settledTx: settled.settledTx } }));
            await refresh();
          } catch (e) {
            guardSession(e);
          } finally {
            settling.current = false;
          }
        }
      } catch {
        /* a failed poll is just a missed update */
      }
    };
    void poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [watching, reference, jwt, signedIn, refresh, guardSession, patch]);

  /** Sign in with the payout partner again (memory-only, so a refresh drops it). One wallet signature. Also fetches
   * where to send the payment if this browser has lost it. */
  const anchorSignIn = useCallback(async () => {
    if (!address || !reference) return;
    setActionError(null);
    setBusy("anchor-sign-in");
    try {
      const cfg = await getAppConfig();
      const token = await sep10Auth({ anchorHomeDomain: cfg.anchorHomeDomain, address, networkPassphrase: cfg.networkPassphrase });
      setJwt(token);
      if (!destination) {
        const tx = await sep6Transaction({ anchorHomeDomain: cfg.anchorHomeDomain, jwt: token, id: reference });
        const account = tx.withdraw_anchor_account;
        const memo = tx.withdraw_memo;
        if (typeof account === "string" && typeof memo === "string") patch(reference, () => ({ destination: { account, memo } }));
      }
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }, [address, reference, destination, patch]);

  // ---- the User's own action: claiming --------------------------------------------------------------------------
  const claim = useCallback(async () => {
    if (!address || !reference) return;
    setActionError(null);
    setBusy("claiming");
    try {
      // Re-read the chain right before signing: the button is a convenience, the chain is the rule.
      const fresh = await readProtection(reference);
      if (fresh?.state.tag !== "Claimable") throw new Error("Your protection isn't available to claim yet.");
      const sent = await claimProtection(address, reference);
      const status = sent?.getTransactionResponse?.status;
      if (status && status !== "SUCCESS") throw new Error(`Transaction did not succeed on-chain (status: ${status}).`);
      let confirmed = false;
      for (let i = 0; i < 8 && !confirmed; i++) {
        confirmed = (await readProtection(reference))?.state.tag === "Claimed";
        if (!confirmed) await sleep(1500);
      }
      await refresh();
      if (!confirmed) throw new Error("Your claim was submitted, but Stellar hasn't confirmed it yet. Check again in a moment.");
      patch(reference, (s) => ({ evidence: { ...s.evidence, claimTx: sent?.sendTransactionResponse?.hash } }));
    } catch (e) {
      setActionError(friendlyError(e));
    } finally {
      setBusy(null);
    }
  }, [address, reference, refresh, patch]);

  // ---- demo only: the simulated principal return ----------------------------------------------------------------
  const simulateRefund = useCallback(async () => {
    if (!reference) return;
    setActionError(null);
    setBusy("refunding");
    try {
      const r = await triggerDemoRefund(reference);
      patch(reference, (s) => ({ evidence: { ...s.evidence, refundTx: r.demoRefundTx ?? r.refundedTx } }));
      await refresh();
    } catch (e) {
      setActionError(friendlyError(guardSession(e)));
    } finally {
      setBusy(null);
    }
  }, [reference, refresh, guardSession, patch]);

  const reset = useCallback(() => {
    clearLastCashOut();
    setScoped(emptyScoped(null));
    setJwt(null);
    setStartError(null);
    setActionError(null);
  }, []);

  const signOut = useCallback(() => {
    disconnect();
    setNeedsSignIn(false);
    setNetworkWarning(null);
  }, [disconnect]);
  const clearStartError = useCallback(() => setStartError(null), []);
  const clearActionError = useCallback(() => setActionError(null), []);

  // ---- what to show -----------------------------------------------------------------------------------------------
  const view: View = useMemo(
    () =>
      deriveView({
        scenario,
        record: record ?? null,
        paymentSent,
        fundingCheck,
        anchorStatus,
        nowSeconds: ledgerNow,
        connectedAddress: address,
        signedIn,
        hasAnchorAuth: !!jwt,
        canSend: !!destination,
      }),
    [scenario, record, paymentSent, fundingCheck, anchorStatus, ledgerNow, address, signedIn, jwt, destination],
  );

  return {
    // wallet / session
    address,
    signedIn,
    needsSignIn,
    busy,
    connectError,
    networkWarning,
    connect,
    disconnect: signOut,
    // compose
    scenario,
    setScenario: setChosen,
    start,
    starting,
    startError,
    clearStartError,
    // tracking
    reference,
    record: record ?? null,
    recordLoading,
    ledgerNow,
    view,
    terminal,
    evidence,
    anchorStatus,
    hasAnchorAuth: !!jwt,
    canSend: !!destination,
    actionError,
    clearActionError,
    send,
    claim,
    simulateRefund,
    anchorSignIn,
    reset,
  };
}

export type CashOutFlow = ReturnType<typeof useCashOutFlow>;
