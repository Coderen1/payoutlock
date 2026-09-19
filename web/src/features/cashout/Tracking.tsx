import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useWalletReadiness } from "../../hooks/useWalletReadiness";
import type { AppConfig } from "../../lib/apiConfig";
import { explorerContractUrl, explorerTxUrl, shorten, stroopsToDecimal } from "../../lib/format";
import { Amount } from "../../ui/Amount";
import { Badge } from "../../ui/Badge";
import { LIFECYCLE } from "../../ui/lifecycle";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { HashChip } from "../../ui/HashChip";
import { Notice } from "../../ui/Notice";
import { ProofList, type ProofItem } from "../../ui/ProofList";
import { Skeleton } from "../../ui/Skeleton";
import { StateMessage } from "../../ui/StateMessage";
import { StatusBadge } from "../../ui/StatusBadge";
import { StatusMark } from "../../ui/StatusMark";
import { StickyActionBar } from "../../ui/StickyActionBar";
import { SummaryList, SummaryRow } from "../../ui/SummaryList";
import { Timeline, TimelineCompact } from "../../ui/Timeline";
import { WalletPrompt } from "../../ui/WalletPrompt";
import { SetupChecklist } from "./Compose.tsx";
import { usesAnchor, type FlowMode } from "./scenario.ts";
import type { CashOutFlow } from "./useCashOutFlow.ts";
import { formatCountdown, useCountdown } from "./useCountdown.ts";
import { useQuote } from "./useQuote.ts";
import { formatClock, formatUsdc, type NoticeKey, type View } from "./view.ts";

/** "Not found" only after the chain has stayed silent for a few seconds: right after a start, the record can take a
 * moment to appear, and that must not flash an error. Deliberately independent of the poll's own loading flag, which
 * flips every few seconds and would keep resetting this timer. If the record shows up later, the view simply switches. */
function useNotFound(reference: string | null, found: boolean): boolean {
  const [gaveUp, setGaveUp] = useState<string | null>(null);
  useEffect(() => {
    if (found || !reference) return;
    const t = window.setTimeout(() => setGaveUp(reference), 6000);
    return () => window.clearTimeout(t);
  }, [reference, found]);
  return !found && gaveUp === reference;
}

const NOTICE_COPY: Record<NoticeKey, { tone: "info" | "warning"; title: string; body: string }> = {
  "window-closed": { tone: "info", title: "The sending window closed", body: "No funds moved. This request is being closed, and you can start a new one." },
  "checking-payment": { tone: "info", title: "Checking for your payment", body: "Making sure a payment you already sent isn't waiting to be confirmed." },
  "connect-to-continue": { tone: "info", title: "Connect your wallet to continue", body: "We need to check whether your payment already arrived before offering to send it." },
  "resume-needs-signin": { tone: "info", title: "Sign in to continue", body: "Sign in with the payout partner again to see where to send your payment." },
  "confirm-payout-needs-signin": { tone: "warning", title: "Keep confirming your payout", body: "We confirm your bank payout while you're signed in with the payout partner. Sign in again so this keeps happening automatically." },
  "cannot-resume-payment": { tone: "warning", title: "This request can't be continued after a refresh", body: "If you haven't paid yet, start a new cash out. Nothing moved on Stellar." },
  "not-owner": { tone: "warning", title: "This cash out belongs to another wallet", body: "Connect the wallet that started it to act on it." },
};

function Notices({ flow, mode }: { flow: CashOutFlow; mode: FlowMode }) {
  const restart = flow.reset;
  const action = (key: NoticeKey): ReactNode => {
    if (key === "connect-to-continue") return <Button size="sm" onClick={flow.connect} status={flow.busy === "connecting" ? "loading" : "idle"}>Connect wallet</Button>;
    if (key === "resume-needs-signin" || key === "confirm-payout-needs-signin") {
      return flow.signedIn ? (
        <Button size="sm" variant="secondary" onClick={flow.anchorSignIn} status={flow.busy === "anchor-sign-in" ? "loading" : "idle"}>Sign in</Button>
      ) : (
        <Button size="sm" onClick={flow.connect} status={flow.busy === "connecting" ? "loading" : "idle"}>Connect wallet</Button>
      );
    }
    if (key === "cannot-resume-payment" || key === "window-closed") {
      return (
        <Button asChild size="sm" variant="secondary">
          <Link to={mode === "live" ? "/app" : "/app/demo"} onClick={restart}>Start a new cash out</Link>
        </Button>
      );
    }
    return undefined;
  };
  return (
    <>
      {flow.view.notices.map((key) => (
        <Notice key={key} tone={NOTICE_COPY[key].tone} title={NOTICE_COPY[key].title} action={action(key)}>
          {key === "not-owner" && flow.record ? `Connect ${shorten(flow.record.user, 4)} to act on it.` : NOTICE_COPY[key].body}
        </Notice>
      ))}
      {flow.needsSignIn && flow.address && !flow.view.terminal && (
        <Notice tone="warning" title="Your sign-in expired" action={<Button size="sm" onClick={flow.connect} status={flow.busy === "connecting" ? "loading" : "idle"}>Sign in again</Button>}>
          Sign in again to keep confirming your cash out.
        </Notice>
      )}
      {flow.networkWarning && <Notice tone="warning" title="Switch networks in your wallet">{flow.networkWarning}</Notice>}
      {flow.actionError && (
        <Notice tone={flow.actionError.kind === "wallet-rejected" ? "neutral" : "error"} title={flow.actionError.title} onDismiss={flow.clearActionError}>
          {flow.actionError.message}
          {flow.actionError.detail && (
            <details className="mt-2 text-caption text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <p className="mt-1 break-words font-mono">{flow.actionError.detail}</p>
            </details>
          )}
        </Notice>
      )}
    </>
  );
}

/** The single action that makes sense right now. Claim is drawn only when the chain state is Claimable — that is
 * decided in deriveView from the record, never from a timer or a guess. */
function PrimaryAction({ flow }: { flow: CashOutFlow }) {
  const { view, record, address, signedIn } = flow;
  const cta = view.cta;
  const needsReadiness = cta?.kind === "send" && signedIn;
  const readiness = useWalletReadiness(needsReadiness ? address : null, record ? stroopsToDecimal(record.collateral_amount) : "0");
  if (!cta) return null;

  if (cta.kind === "start-new") {
    return (
      <Button asChild size="lg" variant="secondary" className="w-full" trailing={<ArrowRight aria-hidden className="size-4" />}>
        <Link to={flow.scenario === "live" ? "/app" : "/app/demo"} onClick={flow.reset}>{cta.label}</Link>
      </Button>
    );
  }

  const wrongWallet = !!record && !!address && record.user !== address;
  if (!signedIn && (cta.kind === "send" || cta.kind === "claim")) {
    return (
      <Button size="lg" className="w-full" onClick={flow.connect} status={flow.busy === "connecting" ? "loading" : "idle"}>
        {cta.kind === "claim" ? "Connect wallet to claim" : "Connect wallet to send"}
      </Button>
    );
  }
  if (cta.kind === "send" && readiness.status !== "ready") {
    return address ? <SetupChecklist address={address} requiredAmount={record ? stroopsToDecimal(record.collateral_amount) : "0"} /> : null;
  }
  if (cta.kind === "claim") {
    return (
      <div className="grid gap-3">
        {flow.busy === "claiming" && <WalletPrompt>Approve the claim in your wallet. You'll pay a small network fee.</WalletPrompt>}
        <Button size="lg" variant="seal" className="w-full" disabled={wrongWallet} status={flow.busy === "claiming" ? "loading" : "idle"} onClick={flow.claim}>
          {cta.label}
        </Button>
      </div>
    );
  }
  if (cta.kind === "send") {
    return (
      <div className="grid gap-3">
        {flow.busy === "sending" && <WalletPrompt>Approve the payment in your wallet. This is the only step that moves funds.</WalletPrompt>}
        <Button size="lg" className="w-full" disabled={wrongWallet} status={flow.busy === "sending" ? "loading" : "idle"} onClick={flow.send} trailing={<ArrowRight aria-hidden className="size-4" />}>
          {cta.label}
        </Button>
      </div>
    );
  }
  // simulate-refund — only ever produced for the refund demo scenario
  return (
    <Button size="lg" variant="secondary" className="w-full" status={flow.busy === "refunding" ? "loading" : "idle"} onClick={flow.simulateRefund}>
      {cta.label}
    </Button>
  );
}

function proofs(flow: CashOutFlow): ProofItem[] {
  const e = flow.evidence;
  const items: ProofItem[] = [];
  const add = (id: string, label: string, hash: string | undefined, description?: string) => {
    if (hash) items.push({ id, label, description, hash, href: explorerTxUrl(hash) });
  };
  add("open", "Protection opened", e.openTx, "Collateral locked");
  add("payment", "Payment sent", e.paymentTx, "Your USDC reached the payout partner");
  add("funded", "Funding confirmed", e.fundedTx);
  add("settled", "Payout confirmed", e.settledTx);
  add("refund", "Principal returned", e.refundTx, "Simulated return");
  add("claim", "Protection claimed", e.claimTx);
  return items;
}

/** "You sent" only once a payment has been sent — before that it is what they are about to send. */
function amountLabel(view: View): string {
  if (view.outcome === "claimed") return "Protection paid";
  if (view.status === "ready") return "You send";
  if (view.status === "expired") return "Requested amount";
  return "You sent";
}

export function TrackingView({ flow, mode, config }: { flow: CashOutFlow; mode: FlowMode; config: AppConfig | null }) {
  const { view, record, reference } = flow;
  const notFound = useNotFound(reference, !!record);
  const remaining = useCountdown(view.countdown?.at ?? null, flow.ledgerNow);
  const [allSteps, setAllSteps] = useState(false);
  const amount = record ? formatUsdc(record.collateral_amount) : null;
  const quote = useQuote({ amount: amount ?? "1", valid: !!record && usesAnchor(flow.scenario), anchorHomeDomain: config?.anchorHomeDomain, usdcIssuer: config?.usdcIssuer });
  const proofItems = proofs(flow);

  if (notFound) {
    return (
      <Card padding="lg">
        <StateMessage
          state="error"
          title="We couldn't load this cash out"
          description="Check the address and your connection, or start a new one."
          action={<Button asChild variant="secondary"><Link to={mode === "live" ? "/app" : "/app/demo"} onClick={flow.reset}>Start a new cash out</Link></Button>}
        />
      </Card>
    );
  }

  const protectedNow = view.status === "active" || view.status === "delayed" || view.status === "available";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <div className="grid gap-6">
        <Card tone={protectedNow ? "protected" : "default"} padding="lg">
          {/* The badge earns its place only when it adds something the headline doesn't already say. */}
          {(view.title !== LIFECYCLE[view.status].label || flow.scenario === "failure" || flow.scenario === "refund") && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {view.title !== LIFECYCLE[view.status].label && <StatusBadge status={view.status} />}
              {(flow.scenario === "failure" || flow.scenario === "refund") && <Badge tone="amber" size="sm">Simulated bank payout</Badge>}
            </div>
          )}

          {view.outcome && view.outcome !== "expired" && (
            <div className="mb-5"><StatusMark state={view.outcome === "claimed" ? "protected" : "success"} size={56} /></div>
          )}
          <h1 className="text-display-m text-foreground">{record ? view.title : <Skeleton className="h-9 w-56" />}</h1>
          <p className="mt-2 text-body text-muted-foreground">{view.description}</p>
          {view.payoutLine && view.status !== "settled" && <p className="mt-1 text-body text-foreground">{view.payoutLine}</p>}

          {(view.countdown || view.deadline) && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-1.5 text-caption font-medium text-foreground">
              {view.countdown && remaining != null ? (
                <>
                  {view.countdown.label} <span className="font-mono tabular-nums">{formatCountdown(remaining)}</span>
                </>
              ) : (
                view.deadline && (
                  <>
                    {view.deadline.label} <span className="tabular-nums">{formatClock(view.deadline.at)}</span>
                  </>
                )
              )}
            </p>
          )}

          <div className="mt-6">
            {record ? (
              <SummaryList>
                <SummaryRow label={amountLabel(view)}>{amount && <Amount value={amount} currency="USDC" size="md" />}</SummaryRow>
                {usesAnchor(flow.scenario) && (
                  <SummaryRow label="You receive" loading={quote.status === "loading" && !quote.quote} hint="Indicative · sandbox rate">
                    {quote.quote ? <Amount value={quote.quote.receive} currency="TRY" size="md" approx /> : <span className="text-muted-foreground">—</span>}
                  </SummaryRow>
                )}
                <SummaryRow label="Protection" emphasis="protected" hint="Covered by collateral locked on Stellar">{amount && <Amount value={amount} currency="USDC" size="md" />}</SummaryRow>
              </SummaryList>
            ) : (
              <div role="status" aria-label="Loading your cash out" className="grid gap-3"><Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
            )}
          </div>

          {/* On phones the progress sits right under the headline; from lg up it has its own column. */}
          <div className="mt-6 lg:hidden">
            <TimelineCompact steps={view.steps} />
            <button type="button" onClick={() => setAllSteps((v) => !v)} aria-expanded={allSteps} className="mt-2 inline-flex h-11 items-center gap-1.5 text-caption font-medium text-sapphire-700">
              {allSteps ? "Hide steps" : "See all steps"}
              <ChevronDown aria-hidden className={allSteps ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
            </button>
            {allSteps && <Timeline steps={view.steps} className="mt-2" />}
          </div>

          {(view.notices.length > 0 || flow.needsSignIn || flow.networkWarning || flow.actionError) && (
            <div className="mt-6 grid gap-3">
              <Notices flow={flow} mode={mode} />
            </div>
          )}

          {view.cta && (
            <div className="mt-6">
              <StickyActionBar reserveSpace={false}>
                <PrimaryAction flow={flow} />
              </StickyActionBar>
            </div>
          )}
        </Card>

        <Card padding="lg">
          <h2 className="text-title text-foreground">Verify on Stellar</h2>
          <p className="mt-1 text-caption text-muted-foreground">Every step leaves a public record you can check yourself.</p>
          <div className="mt-5 grid gap-5">
            {proofItems.length > 0 && <ProofList items={proofItems} />}
            <div className="grid gap-3 border-t border-border pt-5 first:border-0 first:pt-0">
              {config && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body text-muted-foreground">Protection contract</span>
                  <HashChip value={config.contractId} label="protection contract" href={explorerContractUrl(config.contractId)} head={5} tail={5} />
                </div>
              )}
              {reference && (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-body text-muted-foreground">Reference</span>
                  <HashChip value={reference} label="reference" head={8} tail={4} />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      <aside aria-label="Progress" className="hidden lg:sticky lg:top-6 lg:block">
        <Card padding="md">
          <h2 className="mb-5 text-title text-foreground">Progress</h2>
          <Timeline steps={view.steps} />
        </Card>
      </aside>
    </div>
  );
}
