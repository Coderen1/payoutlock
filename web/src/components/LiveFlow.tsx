import { useEffect, useMemo, useState } from "react";
import { getAppConfig } from "../lib/apiConfig";
import { sep10Auth, sep6Withdraw, sep6Transaction, type WithdrawResponse } from "../lib/anchor";
import { openLiveProtection, checkLiveFunding, checkLiveSettlement } from "../lib/api";
import { sendUsdcPayment } from "../lib/payments";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useProtection } from "../hooks/useProtection";
import { ProtectionCard, type KnownTx } from "./ProtectionCard";
import { WalletReadinessGate } from "./WalletReadinessGate";
import { explorerTxUrl, isTerminalState } from "../lib/format";

/** The anchor JWT lives only in this component's state (JS memory) for the
 * lifetime of this flow — never logged, never written to localStorage/the
 * URL. It is forwarded to our backend exactly twice (open + settlement
 * check), both times transiently; our backend never stores it either. */
export function LiveFlow({ address }: { address: string }) {
  const [amount, setAmount] = useState("1");
  const [jwt, setJwt] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<WithdrawResponse | null>(null);
  const [opened, setOpened] = useState<{ anchorWithdrawalId: string } | null>(null);
  const [paid, setPaid] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState<string | null>(null);
  const [openTxHash, setOpenTxHash] = useState<string | null>(null);
  const [fundedTxHash, setFundedTxHash] = useState<string | null>(null);

  const authAction = useAsyncAction<void>();
  const openAction = useAsyncAction<void>();
  const payAction = useAsyncAction<{ hash: string }>();
  const fundingAction = useAsyncAction<void>();
  const settleAction = useAsyncAction<{ settled: boolean; settledTx?: string }>();

  const { record, loading, refresh } = useProtection(opened?.anchorWithdrawalId ?? null);
  const terminal = isTerminalState(record?.state.tag);

  const knownTxs = useMemo(() => {
    const txs: KnownTx[] = [];
    if (openTxHash) txs.push({ label: "Open Protection", hash: openTxHash });
    if (payAction.result?.hash) txs.push({ label: "User Payment", hash: payAction.result.hash });
    if (fundedTxHash) txs.push({ label: "FUNDED attestation", hash: fundedTxHash });
    if (settleAction.result?.settledTx) txs.push({ label: "SETTLED attestation", hash: settleAction.result.settledTx });
    return txs;
  }, [openTxHash, payAction.result, fundedTxHash, settleAction.result]);

  const doAuthAndWithdraw = () =>
    authAction.run(async () => {
      const cfg = await getAppConfig();
      const token = await sep10Auth({ anchorHomeDomain: cfg.anchorHomeDomain, address, networkPassphrase: cfg.networkPassphrase });
      setJwt(token);
      const w = await sep6Withdraw({ anchorHomeDomain: cfg.anchorHomeDomain, jwt: token, amount });
      setWithdraw(w);
    });

  const doOpen = () =>
    openAction.run(async () => {
      if (!jwt || !withdraw) throw new Error("missing SEP-10/SEP-6 state");
      const res = await openLiveProtection({ jwt, anchorWithdrawalId: withdraw.id, fundingDuration: 600, slaDuration: 3600, graceDuration: 1800 });
      if (res.txHash) setOpenTxHash(res.txHash);
      setOpened({ anchorWithdrawalId: withdraw.id });
    });

  const doPay = () =>
    payAction.run(async () => {
      if (!withdraw) throw new Error("no withdraw record");
      const result = await sendUsdcPayment({ fromAddress: address, destination: withdraw.account_id, amountDecimal: amount, memoId: withdraw.memo });
      if (!result.successful) throw new Error("Payment did not succeed on-chain.");
      setPaid(true);
      return result;
    });

  const doCheckFunding = () =>
    fundingAction.run(async () => {
      if (!opened) return;
      for (let i = 0; i < 10; i++) {
        const r = await checkLiveFunding(opened.anchorWithdrawalId);
        if (r.fundedTx) setFundedTxHash(r.fundedTx);
        if (r.funded || r.alreadyPastFunding) return;
        await new Promise((res) => setTimeout(res, 2000));
      }
      throw new Error("Funding not confirmed yet — try again in a few seconds.");
    });

  // Poll the REAL anchor's own status (browser -> anchor directly, CORS
  // confirmed open) purely for display/UX — never used by itself to trigger
  // SETTLED. Only /api/live/check-settlement re-verifying with the anchor
  // server-side does that.
  useEffect(() => {
    if (!jwt || !withdraw || !paid) return;
    let cancelled = false;
    const cfg_ = getAppConfig();
    const poll = async () => {
      const cfg = await cfg_;
      const tx = await sep6Transaction({ anchorHomeDomain: cfg.anchorHomeDomain, jwt, id: withdraw.id }).catch(() => null);
      if (!cancelled && tx) setAnchorStatus(tx.status);
    };
    poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [jwt, withdraw, paid]);

  const doCheckSettlement = () =>
    settleAction.run(async () => {
      if (!jwt || !opened) throw new Error("missing state");
      return checkLiveSettlement({ jwt, anchorWithdrawalId: opened.anchorWithdrawalId });
    });

  return (
    <div className="flow">
      <h3>LIVE ANCHOR FLOW — REAL TR MOCK ANCHOR + STELLAR TESTNET</h3>

      {!withdraw && (
        <div className="row">
          <label>
            Withdraw amount (USDC, min 1){" "}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 80 }} />
          </label>
          <button onClick={doAuthAndWithdraw} disabled={authAction.status === "submitting"}>
            {authAction.status === "submitting" ? "Signing SEP-10 challenge…" : "SEP-10 Auth + SEP-6 Withdraw"}
          </button>
          {authAction.status === "error" && <div className="error-banner">{authAction.error}</div>}
        </div>
      )}

      {withdraw && !opened && (
        <div className="row">
          <p>Withdrawal reference: {withdraw.id}</p>
          <button onClick={doOpen} disabled={openAction.status === "submitting"}>
            {openAction.status === "submitting" ? "Guarantee Provider signing…" : "Open Protection"}
          </button>
          {openAction.status === "error" && <div className="error-banner">{openAction.error}</div>}
        </div>
      )}

      {opened && !paid && withdraw && (
        <div className="row">
          <p>Send {amount} USDC to the anchor's account with your wallet (memo {withdraw.memo}):</p>
          <WalletReadinessGate address={address} requiredAmountDecimal={amount}>
            <button onClick={doPay} disabled={payAction.status === "submitting"}>
              {payAction.status === "submitting" ? "Waiting for wallet…" : "Pay Anchor"}
            </button>
            {payAction.status === "success" && payAction.result && (
              <div className="success-banner">
                Payment confirmed. <a href={explorerTxUrl(payAction.result.hash)} target="_blank" rel="noreferrer">View tx</a>
              </div>
            )}
            {payAction.status === "error" && <div className="error-banner">{payAction.error}</div>}
          </WalletReadinessGate>
        </div>
      )}

      {opened && paid && (
        <>
          {!terminal && (
            <>
              <div className="row">
                <button onClick={doCheckFunding} disabled={fundingAction.status === "submitting"}>
                  {fundingAction.status === "submitting" ? "Verifying payment on-chain…" : "Confirm Funding (FUNDED attestation)"}
                </button>
                {fundingAction.status === "error" && <div className="error-banner">{fundingAction.error}</div>}
              </div>

              <p className="muted">Anchor payout status: {anchorStatus ?? "checking…"}</p>

              <div className="row">
                <button onClick={doCheckSettlement} disabled={settleAction.status === "submitting" || anchorStatus !== "completed"}>
                  {settleAction.status === "submitting"
                    ? "Verifying with anchor + signing…"
                    : anchorStatus === "completed"
                      ? "Confirm Settlement (SETTLED attestation)"
                      : "Waiting for anchor to complete payout…"}
                </button>
                {settleAction.status === "error" && <div className="error-banner">{settleAction.error}</div>}
              </div>
            </>
          )}

          <ProtectionCard
            anchorWithdrawalId={opened.anchorWithdrawalId}
            address={address}
            badge="LIVE ANCHOR FLOW"
            record={record}
            loading={loading}
            refresh={refresh}
            knownTxs={knownTxs}
          />
        </>
      )}
    </div>
  );
}
