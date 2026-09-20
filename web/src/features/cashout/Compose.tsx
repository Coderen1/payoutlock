import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, Check, ChevronDown, Landmark } from "lucide-react";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { useWalletReadiness } from "../../hooks/useWalletReadiness";
import type { AppConfig } from "../../lib/apiConfig";
import { readProtection } from "../../lib/contractRead";
import { enableUsdcTrustline, fundWithFriendbot, getTestUsdcViaAnchorDeposit } from "../../lib/onboarding";
import type { ReadinessStatus } from "../../lib/walletReadiness";
import { Amount } from "../../ui/Amount";
import { AmountInput } from "../../ui/AmountInput";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Field } from "../../ui/Input";
import { Notice } from "../../ui/Notice";
import { Skeleton } from "../../ui/Skeleton";
import { Spinner } from "../../ui/Spinner";
import { StickyActionBar } from "../../ui/StickyActionBar";
import { SummaryList, SummaryRow } from "../../ui/SummaryList";
import { WalletPrompt } from "../../ui/WalletPrompt";
import { cn } from "../../ui/cn";
import { isMobileBrowser } from "./env.ts";
import { effectiveMax } from "./liquidity.ts";
import { MIN_ANCHOR_WITHDRAWAL, MIN_DEMO_SIMULATED, formatCapacity, validateAmount } from "./limits.ts";
import { payoutDestination } from "./payoutDestination.ts";
import { DEMO_SCENARIOS, SCENARIO_COPY, usesAnchor, type FlowMode, type Scenario } from "./scenario.ts";
import { clearLastCashOut, loadLastCashOut } from "./storage.ts";
import type { CashOutFlow } from "./useCashOutFlow.ts";
import { useProviderLiquidity } from "./useProviderLiquidity.ts";
import { useQuote } from "./useQuote.ts";
import { isTerminalTag } from "./view.ts";

const basePath = (mode: FlowMode) => (mode === "live" ? "/app/cash-out" : "/app/demo");

/** ---- demo: choose which outcome to see -------------------------------------------------------------------- */
function DemoChooser({ value, onChange }: { value: Scenario; onChange: (s: Scenario) => void }) {
  return (
    <div role="radiogroup" aria-label="Demo scenario" className="grid gap-3">
      {DEMO_SCENARIOS.map((s) => {
        const on = s === value;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s)}
            className={cn(
              "flex items-start gap-3.5 rounded-card border p-4 text-left transition-colors",
              on ? "border-foreground bg-card shadow-card" : "border-border-strong bg-card/60 hover:bg-card",
            )}
          >
            <span aria-hidden className={cn("mt-1 grid size-5 shrink-0 place-items-center rounded-full border-2", on ? "border-foreground bg-foreground text-background" : "border-input")}>
              {on && <Check className="size-3" strokeWidth={3.5} />}
            </span>
            <span className="grid gap-0.5">
              <span className="font-semibold text-foreground">{SCENARIO_COPY[s].title}</span>
              <span className="text-caption text-muted-foreground">{SCENARIO_COPY[s].blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** ---- resume: the one remembered {flow, reference} ---------------------------------------------------------- */
function ResumeCard({ mode }: { mode: FlowMode }) {
  const [found, setFound] = useState<string | null>(null);
  useEffect(() => {
    const last = loadLastCashOut();
    if (!last || last.flow !== mode) return;
    let alive = true;
    // The chain decides whether there is anything to resume — a finished or unknown cash out is forgotten.
    readProtection(last.reference)
      .then((record) => {
        if (!alive) return;
        if (record && !isTerminalTag(record.state.tag)) setFound(last.reference);
        else clearLastCashOut();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [mode]);
  if (!found) return null;
  return (
    <Notice
      tone="info"
      title="You have a cash out in progress"
      action={
        <Button asChild size="sm" variant="secondary" trailing={<ArrowRight aria-hidden className="size-4" />}>
          <Link to={`${basePath(mode)}/${found}`}>View</Link>
        </Button>
      }
    >
      Pick up where you left off.
    </Notice>
  );
}

/** ---- wallet setup (Testnet) ---------------------------------------------------------------------------------- */
const SETUP_ORDER: ReadinessStatus[] = ["no-account", "low-reserve", "no-trustline", "insufficient-balance", "ready"];
const stage = (s: ReadinessStatus) => (s === "loading" ? -1 : s === "low-reserve" ? 0 : SETUP_ORDER.indexOf(s));

function SetupRow({ n, title, hint, state, action }: { n: number; title: string; hint: string; state: "done" | "current" | "todo"; action?: ReactNode }) {
  return (
    <li className="flex items-start gap-3.5">
      <span
        aria-hidden
        className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 text-caption font-semibold", state === "done" ? "border-foreground bg-foreground text-background" : state === "current" ? "border-sapphire-600 text-sapphire-700" : "border-input text-subtle")}
      >
        {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", state === "todo" ? "text-muted-foreground" : "text-foreground")}>{title}</p>
        <p className="text-caption text-muted-foreground">{hint}</p>
        {state === "current" && action && <div className="mt-3">{action}</div>}
      </div>
    </li>
  );
}

/** A wallet needs a little setup before it can pay on Testnet. Each step is one plain action; chain state (not the
 * action's own result) decides what comes next, exactly as in the engineering console's readiness gate. */
export function SetupChecklist({ address, requiredAmount }: { address: string; requiredAmount: string }) {
  const readiness = useWalletReadiness(address, requiredAmount);
  const fund = useAsyncAction<void>();
  const trust = useAsyncAction<{ hash: string; successful: boolean }>();
  const usdc = useAsyncAction<void>();

  const run = async (action: { run: (fn: () => Promise<any>) => Promise<unknown> }, fn: () => Promise<unknown>) => {
    try {
      await action.run(fn);
    } catch {
      /* the error is on the action and shown below */
    }
    await readiness.refresh();
  };

  if (readiness.status === "ready") return null;
  const at = stage(readiness.status);
  const busy = (a: { status: string }) => (a.status === "submitting" ? "loading" : "idle");
  const failed = fund.error ?? trust.error ?? usdc.error;

  return (
    <Card tone="sunken" padding="md">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-title text-foreground">Set up your wallet</h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-caption font-medium text-amber-700">Testnet</span>
      </div>
      {readiness.status === "loading" ? (
        <div role="status" aria-label="Checking your wallet" className="grid gap-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <ol className="grid gap-5">
          <SetupRow
            n={1}
            title="Fund your account"
            hint="Free Testnet funds, for network fees."
            state={at >= 2 ? "done" : "current"}
            action={<Button size="sm" status={busy(fund)} onClick={() => run(fund, () => fundWithFriendbot(address))}>Get Testnet funds</Button>}
          />
          <SetupRow
            n={2}
            title="Enable USDC"
            hint="Lets your wallet hold USDC. You'll approve it in your wallet."
            state={at >= 3 ? "done" : at === 2 ? "current" : "todo"}
            action={<Button size="sm" status={busy(trust)} onClick={() => run(trust, () => enableUsdcTrustline(address))}>Enable USDC</Button>}
          />
          <SetupRow
            n={3}
            title="Get test USDC"
            hint={readiness.usdcBalance != null ? `You hold ${Number(readiness.usdcBalance).toFixed(2)} USDC. Add some from the sandbox anchor.` : "Add some from the sandbox anchor."}
            state={at >= 4 ? "done" : at === 3 ? "current" : "todo"}
            action={<Button size="sm" status={busy(usdc)} onClick={() => run(usdc, () => getTestUsdcViaAnchorDeposit(address))}>Get test USDC</Button>}
          />
        </ol>
      )}
      {(trust.status === "submitting" || usdc.status === "submitting") && (
        <div className="mt-4">
          <WalletPrompt title={trust.status === "submitting" ? "Check your wallet" : "Working on it"}>
            {trust.status === "submitting" ? "Approve enabling USDC. No funds move." : "Getting test USDC from the sandbox anchor. This can take up to a minute."}
          </WalletPrompt>
        </div>
      )}
      {failed && (
        <Notice className="mt-4" tone="error" title="That didn't work">
          {failed}
        </Notice>
      )}
    </Card>
  );
}

/** ---- starting: what is happening while the wallet and backend work ---------------------------------------- */
export function StartingCard({ step, anchor }: { step: "sign-in" | "secure"; anchor: boolean }) {
  const rows = [
    ...(anchor ? [{ key: "sign-in", label: "Signing in with the payout partner", hint: "Approve the request in your wallet. No funds move." }] : []),
    { key: "secure", label: "Securing your protection", hint: "Locking collateral on Stellar. This takes a few seconds." },
  ];
  const at = rows.findIndex((r) => r.key === step);
  return (
    <Card>
      <h2 className="text-title text-foreground">Starting your protected cash out</h2>
      <ol className="mt-5 grid gap-4">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-start gap-3.5">
            <span aria-hidden className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", i < at ? "bg-foreground text-background" : i === at ? "bg-sapphire-50 text-sapphire-600" : "border-2 border-input")}>
              {i < at ? <Check className="size-4" strokeWidth={3} /> : i === at ? <Spinner size={16} /> : null}
            </span>
            <div>
              <p className={cn("font-medium", i > at ? "text-muted-foreground" : "text-foreground")}>{r.label}</p>
              {i === at && <p className="text-caption text-muted-foreground">{r.hint}</p>}
            </div>
          </li>
        ))}
      </ol>
      {step === "sign-in" && anchor && (
        <div className="mt-5">
          <WalletPrompt>Approve the sign-in request. It's free and no funds move.</WalletPrompt>
        </div>
      )}
    </Card>
  );
}

/** ---- compose -------------------------------------------------------------------------------------------------- */
export function ComposeView({ flow, mode, config, configError }: { flow: CashOutFlow; mode: FlowMode; config: AppConfig | null; configError: string | null }) {
  const scenario = flow.scenario;
  const anchor = usesAnchor(scenario);
  const destination = payoutDestination(mode);
  const min = anchor ? MIN_ANCHOR_WITHDRAWAL : MIN_DEMO_SIMULATED;
  const [amount, setAmount] = useState(scenario === "failure" || scenario === "refund" ? "0.5" : "1");
  const mobile = isMobileBrowser();

  const changeScenario = (s: Scenario) => {
    flow.setScenario(s);
    setAmount(s === "failure" || s === "refund" ? "0.5" : "1");
  };

  const providerLiquidity = useProviderLiquidity();
  const productCap = config ? BigInt(config.maxProtectedAmountStroops) : null;
  // The lower of the product cap and what the provider can back right now. The backend still answers 409
  // (insufficient_provider_liquidity) if the balance moves between this check and the open request.
  const maxStroops = effectiveMax(productCap, providerLiquidity);
  const amountError = validateAmount(amount, { min, maxStroops });
  const quote = useQuote({ amount, valid: anchor && !amountError, anchorHomeDomain: config?.anchorHomeDomain, usdcIssuer: config?.usdcIssuer });
  const readiness = useWalletReadiness(flow.signedIn ? flow.address : null, amountError ? min : amount);
  const ready = flow.signedIn && readiness.status === "ready";
  const copy = SCENARIO_COPY[scenario];

  if (flow.starting) return <StartingCard step={flow.starting} anchor={anchor} />;

  const cta = (() => {
    if (mobile) return { label: "Connect wallet", disabled: true, onClick: () => undefined, status: "idle" as const };
    if (!flow.address) return { label: "Connect wallet", disabled: false, onClick: flow.connect, status: flow.busy === "connecting" ? ("loading" as const) : ("idle" as const) };
    if (flow.needsSignIn || !flow.signedIn) return { label: "Sign in again", disabled: false, onClick: flow.connect, status: flow.busy === "connecting" ? ("loading" as const) : ("idle" as const) };
    return { label: "Start protected cash out", disabled: !!amountError || !ready || !config, onClick: () => flow.start(amount, scenario), status: "idle" as const };
  })();

  return (
    <div className="grid gap-6">
      {mode === "demo" && (
        <section aria-labelledby="scenario-heading" className="grid gap-3">
          <h2 id="scenario-heading" className="text-title text-foreground">Choose a scenario</h2>
          <DemoChooser value={scenario} onChange={changeScenario} />
        </section>
      )}

      <ResumeCard mode={mode} />

      {mobile && (
        <Notice tone="info" title="Open this on a desktop browser">
          Connecting a Stellar wallet needs the Freighter browser extension, which doesn't run on phones. You can still open a cash out's link here to see its status.
        </Notice>
      )}
      {configError && (
        <Notice tone="error" title="Can't reach PayoutLock">
          We couldn't load the service settings. Check that the backend is running and try again.
        </Notice>
      )}
      {flow.connectError && <Notice tone={flow.connectError.kind === "wallet-rejected" ? "neutral" : "error"} title={flow.connectError.title}>{flow.connectError.message}</Notice>}
      {flow.needsSignIn && flow.address && (
        <Notice tone="warning" title="Your sign-in expired">Sign in again to continue. It only takes one tap in your wallet.</Notice>
      )}
      {flow.networkWarning && <Notice tone="warning" title="Switch networks in your wallet">{flow.networkWarning}</Notice>}
      {flow.startError && (
        <Notice tone={flow.startError.kind === "wallet-rejected" ? "neutral" : "error"} title={flow.startError.title} onDismiss={flow.clearStartError}>
          {flow.startError.message}
          {flow.startError.detail && (
            <details className="mt-2 text-caption text-muted-foreground">
              <summary className="cursor-pointer">Details</summary>
              <p className="mt-1 break-words font-mono">{flow.startError.detail}</p>
            </details>
          )}
        </Notice>
      )}
      {flow.signedIn && flow.address && !flow.starting && <SetupChecklist address={flow.address} requiredAmount={amountError ? min : amount} />}

      <Card padding="lg">
        <div className="grid gap-6">
          <Field
            label="You send"
            error={amountError && amount !== "" ? amountError : undefined}
            hint={flow.signedIn && readiness.usdcBalance != null ? `Your balance: ${Number(readiness.usdcBalance).toFixed(2)} USDC` : `Minimum ${Number(min)} USDC${maxStroops !== null ? ` · up to ${formatCapacity(maxStroops)} USDC` : ""}`}
          >
            {(f) => <AmountInput {...f} value={amount} onValueChange={setAmount} currency="USDC" />}
          </Field>

          <SummaryList>
            <SummaryRow label="You receive" loading={anchor && !amountError && quote.status === "loading" && !quote.quote} hint={anchor ? "Indicative · sandbox rate" : "Simulated bank payout"}>
              {anchor ? (
                quote.quote && !amountError ? (
                  <Amount value={quote.quote.receive} currency="TRY" size="md" approx />
                ) : quote.status === "error" ? (
                  <span className="text-muted-foreground">Rate unavailable</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Landmark aria-hidden className="size-4" /> Simulated</span>
              )}
            </SummaryRow>
            <SummaryRow label={destination.label} hint={destination.hint}>
              <span className="whitespace-nowrap font-mono">{destination.value}</span>
            </SummaryRow>
            <SummaryRow label="Protection" emphasis="protected" hint="Covered by collateral locked on Stellar">
              {amountError ? <span className="text-muted-foreground">—</span> : <Amount value={amount} currency="USDC" size="md" />}
            </SummaryRow>
          </SummaryList>

          <details className="group rounded-control border border-border bg-muted/50 px-4 py-3 text-body">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-foreground">
              Details
              <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <dl className="mt-3 grid gap-2.5 text-caption text-muted-foreground">
              {anchor && quote.quote && <div><dt className="font-medium text-foreground">Rate</dt><dd>1 USDC ≈ {quote.quote.rate} TRY{quote.quote.spreadBps != null ? `, including a ${quote.quote.spreadBps / 100}% spread` : ""}. Indicative only — the final amount is set by the bank payout.</dd></div>}
              <div><dt className="font-medium text-foreground">Payout</dt><dd>Bank transfer. This is a sandbox, so no bank details are needed and no real money moves.</dd></div>
              <div><dt className="font-medium text-foreground">Timing</dt><dd>{copy.timing}</dd></div>
              <div><dt className="font-medium text-foreground">Network</dt><dd>Stellar Testnet. Test funds only.</dd></div>
            </dl>
          </details>

          <StickyActionBar reserveSpace={false}>
            <Button size="lg" className="w-full" disabled={cta.disabled} status={cta.status} onClick={cta.onClick} trailing={cta.label === "Start protected cash out" ? <ArrowRight aria-hidden className="size-4" /> : undefined}>
              {cta.label}
            </Button>
          </StickyActionBar>
          {!flow.address && !mobile && <p className="text-center text-caption text-muted-foreground">Your wallet will ask you to approve a sign-in. It's free and no funds move.</p>}
        </div>
      </Card>
    </div>
  );
}
