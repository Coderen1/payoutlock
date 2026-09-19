import { useMemo, type ReactNode } from "react";
import { useLedgerNow } from "../hooks/useLedgerNow";
import { useAsyncAction } from "../hooks/useAsyncAction";
import { advanceToGrace, advanceToClaimable, claimProtection } from "../lib/contractWrite";
import { readProtection, type ProtectionRecord } from "../lib/contractRead";
import { STATE_LABELS, stroopsToDecimal, explorerTxUrl, explorerAccountUrl, shorten, isTerminalState } from "../lib/format";

export interface KnownTx {
  label: string;
  hash: string;
}

interface Props {
  anchorWithdrawalId: string;
  address: string;
  badge: string; // e.g. "LIVE ANCHOR FLOW" or "DEMO ASSURANCE SCENARIO"
  record: ProtectionRecord | null;
  loading: boolean;
  refresh: () => Promise<void>;
  extraActions?: ReactNode;
  /** Transaction hashes the parent flow has collected so far (open tx,
   * payment tx, FUNDED/SETTLED/REFUNDED attestation tx, …) — surfaced as
   * explorer links once the protection reaches a terminal state, so the
   * User doesn't lose access to proof after the action buttons disappear. */
  knownTxs?: KnownTx[];
}

const FINAL_STATE_COPY: Record<string, { heading: string; detail: string; tone: "success" | "muted" }> = {
  Settled: { heading: "Protection Settled", detail: "Anchor payout completed. Collateral released back to the Guarantee Provider.", tone: "success" },
  Refunded: { heading: "Protection Refunded", detail: "Principal returned to the User. Collateral released back to the Guarantee Provider.", tone: "success" },
  Claimed: { heading: "Protection Claimed", detail: "Collateral paid out to the User.", tone: "success" },
  Expired: { heading: "Protection Expired", detail: "Funding window passed without a verified payment. Collateral returned to the Guarantee Provider.", tone: "muted" },
};

/** A contract write action is only ever shown as done once the poll inside
 * `signAndSend()` resolves to Soroban status SUCCESS AND a follow-up chain
 * read confirms the record actually moved to the expected state — a
 * resolved submit call alone is never treated as success. */
async function runAndConfirm(
  anchorWithdrawalId: string,
  submit: () => Promise<any>,
  expectedTag: string,
  refresh: () => Promise<void>,
): Promise<{ txHash?: string }> {
  const sent = await submit();
  const status = sent?.getTransactionResponse?.status;
  if (status && status !== "SUCCESS") {
    throw new Error(`Transaction did not succeed on-chain (status: ${status})`);
  }
  let confirmed = false;
  for (let i = 0; i < 6 && !confirmed; i++) {
    const fresh = await readProtection(anchorWithdrawalId);
    if (fresh?.state.tag === expectedTag) confirmed = true;
    else await new Promise((r) => setTimeout(r, 1500));
  }
  await refresh(); // sync the displayed record with what we just confirmed
  if (!confirmed) {
    throw new Error(`Transaction submitted, but on-chain state did not reach "${expectedTag}" yet — re-check shortly.`);
  }
  return { txHash: sent?.sendTransactionResponse?.hash };
}

export function ProtectionCard({ anchorWithdrawalId, address, badge, record, loading, refresh, extraActions, knownTxs }: Props) {
  const ledgerNow = useLedgerNow();
  const graceAction = useAsyncAction<{ txHash?: string }>();
  const claimableAction = useAsyncAction<{ txHash?: string }>();
  const claimAction = useAsyncAction<{ txHash?: string }>();

  const stateTag = record?.state.tag;
  const terminal = isTerminalState(stateTag);

  const canAdvanceToGrace = useMemo(
    () => stateTag === "Pending" && record?.sla_deadline != null && ledgerNow != null && ledgerNow > Number(record.sla_deadline),
    [stateTag, record, ledgerNow],
  );
  const canAdvanceToClaimable = useMemo(
    () => stateTag === "Grace" && record?.grace_deadline != null && ledgerNow != null && ledgerNow > Number(record.grace_deadline),
    [stateTag, record, ledgerNow],
  );
  // The one rule the user called out explicitly: this is gated on real chain
  // state (`stateTag === "Claimable"`), never on a locally-assumed timeline.
  const canClaim = stateTag === "Claimable";

  if (loading && !record) return <div className="card">Loading protection state from chain…</div>;
  if (!record) return <div className="card muted">No on-chain protection record yet for this reference.</div>;

  const allTxs: KnownTx[] = [...(knownTxs ?? [])];
  if (claimAction.result?.txHash) allTxs.push({ label: "Claim", hash: claimAction.result.txHash });

  return (
    <div className="card">
      <div className="badge">{badge}</div>
      <div className="state-row">
        <span className={`state-pill state-${stateTag}`}>{STATE_LABELS[stateTag ?? ""] ?? stateTag}</span>
        <span className="muted">on-chain, re-read every few seconds</span>
      </div>

      <dl className="fact-list">
        <dt>Protected amount</dt>
        <dd>{stroopsToDecimal(record.collateral_amount)} USDC</dd>
        <dt>User</dt>
        <dd><a href={explorerAccountUrl(record.user)} target="_blank" rel="noreferrer">{shorten(record.user)}</a></dd>
        <dt>Guarantee Provider</dt>
        <dd><a href={explorerAccountUrl(record.guarantee_provider)} target="_blank" rel="noreferrer">{shorten(record.guarantee_provider)}</a></dd>
        <dt>Funding deadline</dt>
        <dd>{new Date(Number(record.funding_deadline) * 1000).toLocaleString()}</dd>
        {record.sla_deadline != null && (
          <>
            <dt>SLA deadline</dt>
            <dd>{new Date(Number(record.sla_deadline) * 1000).toLocaleString()}</dd>
          </>
        )}
        {record.grace_deadline != null && (
          <>
            <dt>Grace deadline</dt>
            <dd>{new Date(Number(record.grace_deadline) * 1000).toLocaleString()}</dd>
          </>
        )}
      </dl>

      {!terminal && extraActions}

      {!terminal && stateTag === "Pending" && (
        <button
          disabled={!canAdvanceToGrace || graceAction.status === "submitting"}
          onClick={() => graceAction.run(() => runAndConfirm(anchorWithdrawalId, () => advanceToGrace(address, anchorWithdrawalId), "Grace", refresh))}
        >
          {graceAction.status === "submitting" ? "Submitting…" : canAdvanceToGrace ? "Advance to Grace (SLA expired)" : "Waiting for SLA to expire…"}
        </button>
      )}
      {!terminal && stateTag === "Grace" && (
        <button
          disabled={!canAdvanceToClaimable || claimableAction.status === "submitting"}
          onClick={() => claimableAction.run(() => runAndConfirm(anchorWithdrawalId, () => advanceToClaimable(address, anchorWithdrawalId), "Claimable", refresh))}
        >
          {claimableAction.status === "submitting" ? "Submitting…" : canAdvanceToClaimable ? "Advance to Claimable (grace expired)" : "Waiting for grace period to expire…"}
        </button>
      )}
      {!terminal && (stateTag === "Grace" || stateTag === "Claimable") && (
        <button
          disabled={!canClaim || claimAction.status === "submitting"}
          onClick={() => claimAction.run(() => runAndConfirm(anchorWithdrawalId, () => claimProtection(address, anchorWithdrawalId), "Claimed", refresh))}
        >
          {claimAction.status === "submitting" ? "Submitting…" : canClaim ? "Claim Protection" : "Not yet Claimable"}
        </button>
      )}
      {!terminal && [graceAction, claimableAction, claimAction].map((a, i) => a.status === "error" && <div key={i} className="error-banner">{a.error}</div>)}

      {terminal && stateTag && (
        <div className={`final-state-card final-state-${FINAL_STATE_COPY[stateTag]?.tone ?? "muted"}`}>
          <div className="final-state-check">{FINAL_STATE_COPY[stateTag]?.tone === "success" ? "✓" : "•"}</div>
          <div>
            <div className="final-state-heading">{FINAL_STATE_COPY[stateTag]?.heading ?? stateTag}</div>
            <div>{FINAL_STATE_COPY[stateTag]?.detail}</div>
            {allTxs.length > 0 && (
              <div className="proof-links">
                <span className="muted">Verify on Stellar: </span>
                {allTxs.map((tx, i) => (
                  <span key={tx.hash}>
                    {i > 0 && " · "}
                    <a href={explorerTxUrl(tx.hash)} target="_blank" rel="noreferrer">{tx.label}</a>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
