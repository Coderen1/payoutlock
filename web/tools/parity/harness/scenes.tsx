// Parity harness: renders the REAL legacy components with fixed fixtures so the
// same markup can be compared before/after the migration. Not part of the product.
import { ProtectionCard } from "../../../src/components/ProtectionCard";
import { WalletReadinessGate } from "../../../src/components/WalletReadinessGate";

const USER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
const GP = "GDXYO6FJCNXZEWGXD54GT76FGFYLOLSOGSOJLNQ6WGHCGEQPO7NTE73M";
const rec = (tag: string, over: Record<string, unknown> = {}): any => ({
  anchor_withdrawal_id: new Uint8Array(), anchor_memo: new Uint8Array(), user: USER, guarantee_provider: GP,
  collateral_amount: 10000000n, created_at: 1758198000n, funding_duration: 600n, sla_duration: 3600n, grace_duration: 1800n,
  funding_deadline: 1758198600n, funded_at: 1758198500n, sla_deadline: 1758202100n, grace_deadline: 1758203900n,
  state: { tag }, last_attested_status: { tag: "None" }, ...over,
});
const txs = [
  { label: "Open Protection", hash: "a".repeat(64) },
  { label: "User Payment", hash: "b".repeat(64) },
  { label: "FUNDED attestation", hash: "c".repeat(64) },
];
const noop = async () => {};
const card = (r: any, extra: Record<string, unknown> = {}) => (
  <div className="flow">
    <ProtectionCard anchorWithdrawalId="parity-withdrawal-0001" address={USER} badge="LIVE ANCHOR FLOW" record={r} loading={false} refresh={noop} knownTxs={txs} {...extra} />
  </div>
);

export function Scene() {
  const scene = new URLSearchParams(location.search).get("scene") ?? "";
  if (scene.startsWith("card-")) {
    const tag = scene.slice(5);
    if (tag === "loading") return card(null, { loading: true });
    if (tag === "empty") return card(null);
    if (tag === "AwaitingFunding") return card(rec(tag, { funded_at: null, sla_deadline: null, grace_deadline: null }));
    return card(rec(tag));
  }
  if (scene.startsWith("gate-")) {
    return (
      <div className="flow">
        <div className="row">
          <WalletReadinessGate address={USER} requiredAmountDecimal="0.5">
            <button>READY-CHILD-BUTTON</button>
          </WalletReadinessGate>
        </div>
      </div>
    );
  }
  if (scene === "kitchen") {
    return (
      <div className="app">
        <header><h1>PayoutLock</h1><p className="tagline">tagline</p></header>
        <div className="connect-bar"><span className="pill">GBBD47...LFLA5</span><button>Disconnect</button></div>
        <div className="error-banner">error banner</div>
        <div className="success-banner">success banner <a href="#x">View tx</a></div>
        <nav className="tabs"><button className="active">Active</button><button>Other</button></nav>
        <div className="flow"><h3>flow heading</h3><div className="row"><label>label <input defaultValue="1" style={{ width: 80 }} /></label><button disabled>disabled</button></div></div>
        <div className="card"><span className="badge">BADGE</span><div className="state-row"><span className="state-pill state-Pending">Protection Active</span><span className="muted">muted</span></div>
          <dl className="fact-list"><dt>dt</dt><dd>dd</dd></dl></div>
        <section className="tech-notes"><h4>Security notes</h4><ul><li><strong>strong</strong> <code>code</code> <em>em</em></li></ul></section>
        <div className="final-state-card final-state-success"><div className="final-state-check">✓</div><div><div className="final-state-heading">Heading</div><div>detail</div><div className="proof-links"><span className="muted">Verify: </span><a href="#y">tx</a></div></div></div>
        <div className="final-state-card final-state-muted"><div className="final-state-check">•</div><div><div className="final-state-heading">Muted</div></div></div>
      </div>
    );
  }
  return <div>unknown scene</div>;
}
