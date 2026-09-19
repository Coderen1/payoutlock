import { useMemo, useState } from "react";
import { openDemoRefund, checkDemoFunding, triggerDemoRefund } from "../lib/api";
import { sendUsdcPayment } from "../lib/payments";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { useProtection } from "../hooks/useProtection";
import { ProtectionCard, type KnownTx } from "./ProtectionCard";
import { WalletReadinessGate } from "./WalletReadinessGate";
import { isTerminalState } from "../lib/format";

export function DemoRefundFlow({ address }: { address: string }) {
  const [amount, setAmount] = useState("0.5");
  const [opened, setOpened] = useState<{ anchorWithdrawalId: string; demoOffRampAddress: string; memo: string } | null>(null);
  const [paid, setPaid] = useState(false);
  const [funded, setFunded] = useState(false);
  const [openTxHash, setOpenTxHash] = useState<string | null>(null);
  const [fundedTxHash, setFundedTxHash] = useState<string | null>(null);

  const openAction = useAsyncAction<void>();
  const payAction = useAsyncAction<{ hash: string }>();
  const fundingAction = useAsyncAction<void>();
  const refundAction = useAsyncAction<{ demoRefundTx?: string; refundedTx?: string }>();

  const { record, loading, refresh } = useProtection(opened?.anchorWithdrawalId ?? null);
  const terminal = isTerminalState(record?.state.tag);

  const knownTxs = useMemo(() => {
    const txs: KnownTx[] = [];
    if (openTxHash) txs.push({ label: "Open Protection", hash: openTxHash });
    if (payAction.result?.hash) txs.push({ label: "User Payment", hash: payAction.result.hash });
    if (fundedTxHash) txs.push({ label: "FUNDED attestation", hash: fundedTxHash });
    if (refundAction.result?.demoRefundTx) txs.push({ label: "Demo Refund payment", hash: refundAction.result.demoRefundTx });
    if (refundAction.result?.refundedTx) txs.push({ label: "REFUNDED attestation", hash: refundAction.result.refundedTx });
    return txs;
  }, [openTxHash, payAction.result, fundedTxHash, refundAction.result]);

  const doOpen = () =>
    openAction.run(async () => {
      const res = await openDemoRefund({ amountDecimal: amount });
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
        if (r.funded || r.alreadyPastFunding) {
          setFunded(true);
          return;
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
      throw new Error("Funding not confirmed yet — try again in a few seconds.");
    });

  const doTriggerRefund = () => refundAction.run(() => triggerDemoRefund(opened!.anchorWithdrawalId));

  return (
    <div className="flow">
      <h3>SIMULATED REFUND SOURCE — REAL TESTNET USDC PRINCIPAL RETURN</h3>
      <p className="muted">
        TR Mock Anchor has no native refund endpoint (confirmed limitation). The dedicated Demo Refund Account
        sends a REAL Testnet USDC payment of the exact protected amount back to the User; the backend
        independently verifies that payment on-chain BEFORE signing REFUNDED.
      </p>

      {!opened && (
        <div className="row">
          <label>
            Protected amount (USDC){" "}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: 80 }} />
          </label>
          <button onClick={doOpen} disabled={openAction.status === "submitting"}>
            {openAction.status === "submitting" ? "Opening…" : "Open Demo Refund Scenario"}
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
            {payAction.status === "error" && <div className="error-banner">{payAction.error}</div>}
          </WalletReadinessGate>
        </div>
      )}

      {opened && paid && !funded && !terminal && (
        <div className="row">
          <button onClick={doCheckFunding} disabled={fundingAction.status === "submitting"}>
            {fundingAction.status === "submitting" ? "Verifying payment on-chain…" : "Confirm Funding (FUNDED attestation)"}
          </button>
          {fundingAction.status === "error" && <div className="error-banner">{fundingAction.error}</div>}
        </div>
      )}

      {opened && funded && (
        <>
          {!terminal && (
            <div className="row">
              <button onClick={doTriggerRefund} disabled={refundAction.status === "submitting"}>
                {refundAction.status === "submitting"
                  ? "Sending real refund + verifying…"
                  : "[SIMULATED REFUND SOURCE] Trigger principal return"}
              </button>
              {refundAction.status === "error" && <div className="error-banner">{refundAction.error}</div>}
            </div>
          )}

          <ProtectionCard
            anchorWithdrawalId={opened.anchorWithdrawalId}
            address={address}
            badge="DEMO ASSURANCE SCENARIO — SIMULATED REFUND SOURCE"
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
