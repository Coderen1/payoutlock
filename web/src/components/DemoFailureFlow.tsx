import { useMemo, useState } from "react";
import { openDemoFailure, checkDemoFunding, triggerDemoFailed } from "../lib/api";
import { sendUsdcPayment } from "../lib/payments";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useProtection } from "../hooks/useProtection";
import { ProtectionCard, type KnownTx } from "./ProtectionCard";
import { WalletReadinessGate } from "./WalletReadinessGate";
import { explorerTxUrl, isTerminalState } from "../lib/format";

export function DemoFailureFlow({ address }: { address: string }) {
  const [amount, setAmount] = useState("0.5");
  const [opened, setOpened] = useState<{ anchorWithdrawalId: string; demoOffRampAddress: string; memo: string } | null>(null);
  const [paid, setPaid] = useState(false);
  const [openTxHash, setOpenTxHash] = useState<string | null>(null);
  const [fundedTxHash, setFundedTxHash] = useState<string | null>(null);

  const openAction = useAsyncAction<void>();
  const payAction = useAsyncAction<{ hash: string }>();
  const fundingAction = useAsyncAction<void>();
  const failedAction = useAsyncAction<{ failedTx?: string }>();

  const { record, loading, refresh } = useProtection(opened?.anchorWithdrawalId ?? null);
  const terminal = isTerminalState(record?.state.tag);

  const knownTxs = useMemo(() => {
    const txs: KnownTx[] = [];
    if (openTxHash) txs.push({ label: "Open Protection", hash: openTxHash });
    if (payAction.result?.hash) txs.push({ label: "User Payment", hash: payAction.result.hash });
    if (fundedTxHash) txs.push({ label: "FUNDED attestation", hash: fundedTxHash });
    if (failedAction.result?.failedTx) txs.push({ label: "FAILED (informational)", hash: failedAction.result.failedTx });
    return txs;
  }, [openTxHash, payAction.result, fundedTxHash, failedAction.result]);

  const doOpen = () =>
    openAction.run(async () => {
      const res = await openDemoFailure({ amountDecimal: amount });
      if (res.txHash) setOpenTxHash(res.txHash);
      setOpened({ anchorWithdrawalId: res.anchorWithdrawalId, demoOffRampAddress: res.demoOffRampAddress, memo: res.memo });
    });

  const doPay = () =>
    payAction.run(async () => {
      if (!opened) throw new Error("not opened yet");
      const result = await sendUsdcPayment({
        fromAddress: address,
        destination: opened.demoOffRampAddress,
        amountDecimal: amount,
        memoId: opened.memo,
      });
      if (!result.successful) throw new Error("Payment did not succeed on-chain.");
      setPaid(true);
      return result;
    });

  const doCheckFunding = () =>
    fundingAction.run(async () => {
      if (!opened) return;
      for (let i = 0; i < 10; i++) {
        const r = await checkDemoFunding(opened.anchorWithdrawalId);
        if (r.fundedTx) setFundedTxHash(r.fundedTx);
        if (r.funded || r.alreadyPastFunding) return;
        await new Promise((res) => setTimeout(res, 2000));
      }
      throw new Error("Funding not confirmed yet — try again in a few seconds.");
    });

  const doTriggerFailed = () =>
    failedAction.run(() => triggerDemoFailed(opened!.anchorWithdrawalId));

  return (
    <div className="flow">
      <h3>SIMULATED FIAT PAYOUT FAILURE — REAL TESTNET COLLATERAL CLAIM</h3>
      <p className="muted">
        A demo-only withdrawal reference stands in for the anchor (TR Mock Anchor cannot natively produce a
        "USDC received but fiat payout failed" outcome). Funding is a real Testnet USDC payment, independently
        verified on-chain before FUNDED is signed — identical discipline to the live flow.
      </p>

      {!opened && (
        <div className="row">
          <label>
            Protected amount (USDC){" "}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 80 }} />
          </label>
          <button onClick={doOpen} disabled={openAction.status === "submitting"}>
            {openAction.status === "submitting" ? "Opening…" : "Open Demo Failure Scenario"}
          </button>
        </div>
      )}
      {openAction.status === "error" && <div className="error-banner">{openAction.error}</div>}

      {opened && !paid && (
        <div className="row">
          <p>Pay {amount} USDC to the Demo Off-Ramp Account (memo {opened.memo}) with your wallet:</p>
          <WalletReadinessGate address={address} requiredAmountDecimal={amount}>
            <button onClick={doPay} disabled={payAction.status === "submitting"}>
              {payAction.status === "submitting" ? "Waiting for wallet…" : "Pay Demo Off-Ramp Account"}
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

              <div className="row">
                <button onClick={doTriggerFailed} disabled={failedAction.status === "submitting"}>
                  {failedAction.status === "submitting" ? "Signing…" : "[SIMULATED FIAT PAYOUT FAILURE] Send informational FAILED"}
                </button>
                {failedAction.status === "success" && failedAction.result?.failedTx && (
                  <span className="muted"> informational only — <a href={explorerTxUrl(failedAction.result.failedTx)} target="_blank" rel="noreferrer">tx</a></span>
                )}
              </div>
            </>
          )}

          <ProtectionCard
            anchorWithdrawalId={opened.anchorWithdrawalId}
            address={address}
            badge="DEMO ASSURANCE SCENARIO — SIMULATED FIAT PAYOUT FAILURE"
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
