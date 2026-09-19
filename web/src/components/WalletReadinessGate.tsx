import type { ReactNode } from "react";
import { useWalletReadiness } from "../hooks/useWalletReadiness";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { fundWithFriendbot, enableUsdcTrustline, getTestUsdcViaAnchorDeposit } from "../lib/onboarding";

interface Props {
  address: string;
  /** Decimal USDC amount the wrapped payment action needs (e.g. "0.5"). */
  requiredAmountDecimal: string;
  /** Rendered only once every readiness check passes. */
  children: ReactNode;
}

/** Shared onboarding gate for every flow that sends a USDC payment (Live
 * Anchor, Demo Failure, Demo Refund). Each unmet precondition gets its own
 * explicit, single-purpose action; the wrapped payment UI only appears once
 * chain state says the wallet can actually pay. */
export function WalletReadinessGate({ address, requiredAmountDecimal, children }: Props) {
  const readiness = useWalletReadiness(address, requiredAmountDecimal);
  const friendbotAction = useAsyncAction<void>();
  const trustlineAction = useAsyncAction<void>();
  const depositAction = useAsyncAction<void>();

  const run = async (action: ReturnType<typeof useAsyncAction<void>>, fn: () => Promise<void>) => {
    try {
      await action.run(fn);
    } catch {
      // Error is already captured in `action.error` and shown below.
    }
    await readiness.refresh(); // chain state — not the action's own result — decides what happens next
  };

  if (readiness.status === "ready") return <>{children}</>;

  return (
    <div className="card readiness-gate">
      <div className="badge">WALLET READINESS</div>
      <p className="muted">
        Your wallet needs a few things in place on Stellar Testnet before it can pay.
        {readiness.xlmBalance != null && <> XLM: {readiness.xlmBalance}.</>}
        {readiness.usdcBalance != null && <> USDC: {readiness.usdcBalance}.</>}
      </p>

      {readiness.status === "loading" && <p>Checking wallet readiness…</p>}

      {(readiness.status === "no-account" || readiness.status === "low-reserve") && (
        <>
          <p>
            {readiness.status === "no-account"
              ? "This wallet account does not exist on Testnet yet."
              : "This wallet does not hold enough XLM to open a USDC trustline."}
          </p>
          <button onClick={() => run(friendbotAction, () => fundWithFriendbot(address))} disabled={friendbotAction.status === "submitting"}>
            {friendbotAction.status === "submitting" ? "Requesting XLM…" : "Fund with Friendbot (XLM)"}
          </button>
          {friendbotAction.status === "error" && <div className="error-banner">{friendbotAction.error}</div>}
        </>
      )}

      {readiness.status === "no-trustline" && (
        <>
          <p>Your wallet has no trustline for the anchor's Testnet USDC yet.</p>
          <button onClick={() => run(trustlineAction, async () => { await enableUsdcTrustline(address); })} disabled={trustlineAction.status === "submitting"}>
            {trustlineAction.status === "submitting" ? "Waiting for wallet…" : "Enable Test USDC"}
          </button>
          {trustlineAction.status === "error" && <div className="error-banner">{trustlineAction.error}</div>}
        </>
      )}

      {readiness.status === "insufficient-balance" && (
        <>
          <p>
            This step needs {requiredAmountDecimal} USDC, but your wallet holds {readiness.usdcBalance} USDC.
          </p>
          <button onClick={() => run(depositAction, () => getTestUsdcViaAnchorDeposit(address))} disabled={depositAction.status === "submitting"}>
            {depositAction.status === "submitting" ? "Getting test USDC from the anchor…" : "Get Test USDC"}
          </button>
          {depositAction.status === "error" && <div className="error-banner">{depositAction.error}</div>}
        </>
      )}
    </div>
  );
}
