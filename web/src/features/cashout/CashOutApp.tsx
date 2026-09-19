import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { explorerAccountUrl } from "../../lib/format";
import { PLRoot } from "../../ui/PLRoot";
import { SandboxRibbon } from "../../ui/SandboxRibbon";
import { TestnetPill } from "../../ui/TestnetPill";
import { WalletChip } from "../../ui/WalletChip";
import { useDocumentMeta } from "../../ui/useDocumentMeta";
import { ComposeView } from "./Compose.tsx";
import { TrackingView } from "./Tracking.tsx";
import type { FlowMode } from "./scenario.ts";
import { useAppConfigState } from "./useAppConfigState.ts";
import { useCashOutFlow } from "./useCashOutFlow.ts";

/** /app and /app/demo. One component serves both, and the compose and tracking views (`/app`, `/app/cash-out/:ref`,
 * `/app/demo`, `/app/demo/:ref`), so what the browser holds in memory survives the step from one to the other.
 * The demo differs in only two ways: it offers the three scenarios, and it wears the permanent simulated-outcome ribbon. */
export default function CashOutApp({ mode }: { mode: FlowMode }) {
  const { reference } = useParams();
  const navigate = useNavigate();
  const { config, error: configError } = useAppConfigState();
  const onStarted = useCallback((id: string) => navigate(`${mode === "live" ? "/app/cash-out" : "/app/demo"}/${id}`), [navigate, mode]);
  const flow = useCashOutFlow({ mode, reference: reference ?? null, onStarted });
  useDocumentMeta({ title: mode === "demo" ? "Demo scenarios · PayoutLock" : "Protected Cash Out · PayoutLock" });

  return (
    <PLRoot>
      {mode === "demo" && <SandboxRibbon />}
      <header className="border-b border-border bg-background/85">
        <div className="mx-auto flex w-[min(100%_-_2.5rem,960px)] items-center justify-between gap-3 py-3.5">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-title text-foreground" aria-label="PayoutLock home">PayoutLock</Link>
            <TestnetPill className="hidden xs:inline-flex" />
          </div>
          <WalletChip
            address={flow.address}
            connecting={flow.busy === "connecting"}
            onConnect={flow.connect}
            onDisconnect={flow.disconnect}
            explorerUrl={flow.address ? explorerAccountUrl(flow.address) : undefined}
          />
        </div>
        {/* The pill above needs room; on phones the same honesty marker sits on its own line (the demo ribbon already says it) */}
        {mode === "live" && (
          <p className="border-t border-border py-1.5 text-center font-mono text-mono uppercase tracking-[0.08em] text-subtle xs:hidden">
            <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-amber-600 align-middle" />
            Stellar Testnet · sandbox anchor
          </p>
        )}
      </header>

      {/* pb-32 on phones: room for the fixed action bar, reserved once for the whole page */}
      <main className="mx-auto w-[min(100%_-_2.5rem,960px)] pb-32 pt-8 sm:pt-12 md:pb-12">
        {reference ? (
          <TrackingView flow={flow} mode={mode} config={config} />
        ) : (
          <div className="mx-auto w-full max-w-[520px]">
            <div className="mb-8">
              <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{mode === "demo" ? "Stellar Testnet · Simulated fiat outcome" : "Stellar Testnet · sandbox anchor"}</p>
              <h1 className="mt-3 text-display-m text-foreground">{mode === "demo" ? "Demo scenarios" : "Protected Cash Out"}</h1>
              <p className="mt-3 text-lead text-muted-foreground">
                {mode === "demo"
                  ? "See each outcome on the same product screens. Everything on Stellar is real Testnet; the bank side is simulated."
                  : "Send USDC, receive TRY by bank transfer, and stay covered while the payout is processed."}
              </p>
            </div>
            <ComposeView flow={flow} mode={mode} config={config} configError={configError} />
          </div>
        )}
      </main>
    </PLRoot>
  );
}
