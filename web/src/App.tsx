import { useEffect, useState } from "react";
import { ConnectBar } from "./components/ConnectBar";
import { LiveFlow } from "./components/LiveFlow";
import { DemoFailureFlow } from "./components/DemoFailureFlow";
import { DemoRefundFlow } from "./components/DemoRefundFlow";
import { useSession } from "./lib/session";
import { getAppConfig, type AppConfig } from "./lib/apiConfig";

type Tab = "live" | "demo-failure" | "demo-refund";

export default function App() {
  const session = useSession();
  const [tab, setTab] = useState<Tab>("live");
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  useEffect(() => {
    getAppConfig().then(setCfg).catch((e) => setCfgError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="app">
      <header>
        <h1>PayoutLock</h1>
        <p className="tagline">Protecting the last mile between Stellar and fiat.</p>
        <ConnectBar />
      </header>

      {cfgError && <div className="error-banner">Cannot reach orchestration API: {cfgError}</div>}

      {session.address && session.appSessionToken && cfg && (
        <>
          <nav className="tabs">
            <button className={tab === "live" ? "active" : ""} onClick={() => setTab("live")}>
              Live Anchor Flow
            </button>
            {cfg.demoMode && (
              <>
                <button className={tab === "demo-failure" ? "active" : ""} onClick={() => setTab("demo-failure")}>
                  Demo: Payout Failure
                </button>
                <button className={tab === "demo-refund" ? "active" : ""} onClick={() => setTab("demo-refund")}>
                  Demo: Refund
                </button>
              </>
            )}
          </nav>

          {tab === "live" && <LiveFlow address={session.address} />}
          {tab === "demo-failure" && cfg.demoMode && <DemoFailureFlow address={session.address} />}
          {tab === "demo-refund" && cfg.demoMode && <DemoRefundFlow address={session.address} />}

          <section className="tech-notes">
            <h4>Security notes</h4>
            <ul>
              <li>
                <strong>No claim without verified funding.</strong> A protection only ever moves out of "Awaiting
                Funding" after a FUNDED attestation backed by an independently-verified on-chain payment.
              </li>
              <li>
                If a User never sends payment before the funding deadline, anyone can call <code>expire_unfunded</code> —
                the protection moves to <em>Expired</em> and the Guarantee Provider's collateral is returned. This path
                is implemented and tested but not wired into this UI as a live demo step.
              </li>
            </ul>
          </section>
        </>
      )}

      {(!session.address || !session.appSessionToken) && (
        <p className="muted">Connect your Testnet wallet (Freighter) to begin.</p>
      )}
    </div>
  );
}
