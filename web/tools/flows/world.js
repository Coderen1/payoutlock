// A simulated universe for the browser: a wallet, the backend API, the chain (with the keeper's role played by the
// test), the anchor, and Horizon-side readiness. The app's own code runs unchanged; only the modules in src/lib that
// perform I/O are replaced (see stubs.mjs). Nothing here touches Testnet or spends any funds.
(() => {
  const nowS = () => Math.floor(Date.now() / 1000);
  const w = (window.__world = {
    calls: [], // every stubbed call, by name — lets tests assert what the app did (and did NOT) call
    lag: 6, // the ledger clock trails wall time, as on Testnet
    delay: 220,
    sessionTtl: 900,
    sessionRevoked: false,
    durations: { funding: 600, sla: 3600, grace: 1800 },
    wallet: { address: "GBTESTWALLETAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", rejectNext: null },
    readiness: { status: "ready", xlm: "9999.0000000", usdc: "5.0000000", steps: ["no-account", "no-trustline", "insufficient-balance", "ready"] },
    cfg: {
      contractId: "CDTESTCONTRACTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      usdcSacId: "CBTESTSACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      usdcIssuer: "GBTESTISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      rpcUrl: "https://rpc.test.invalid",
      networkPassphrase: "Test SDF Network ; September 2015",
      anchorHomeDomain: "anchor.test.invalid",
      demoMode: true,
      maxProtectedAmountStroops: "20000000",
    },
    records: new Map(),
    anchor: new Map(), // withdrawal id -> SEP-6 status
    paid: new Set(),
    memoToId: new Map(),
    fail: {}, // fail.<step> = "message": the next call to that step throws it once
    n: 0,
    sleep: (ms = w.delay) => new Promise((r) => setTimeout(r, ms)),
    ledgerNow: () => nowS() - w.lag,
    rec(name) {
      w.calls.push(name);
    },
    count: (name) => w.calls.filter((c) => c === name).length,
    requireSession() {
      if (w.sessionRevoked) throw new Error("invalid_or_expired_session");
    },
    maybeFail(step) {
      if (w.fail[step]) {
        const m = w.fail[step];
        delete w.fail[step];
        throw new Error(m);
      }
    },
    /** A protection on the "chain". Times are relative to now (seconds). */
    make(id, opts = {}) {
      const t = nowS();
      const tag = opts.tag ?? "AwaitingFunding";
      const funded = tag !== "AwaitingFunding" && tag !== "Expired";
      const d = { ...w.durations, ...(opts.durations ?? {}) };
      const fundedAt = funded ? t - (opts.fundedAgo ?? 30) : null;
      const record = {
        anchor_withdrawal_id: new TextEncoder().encode(id),
        anchor_memo: new TextEncoder().encode("memo"),
        user: opts.user ?? w.wallet.address,
        guarantee_provider: "GBTESTPROVIDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        collateral_amount: BigInt(opts.amount ?? "10000000"),
        created_at: BigInt(t - (opts.createdAgo ?? 60)),
        funding_duration: BigInt(d.funding),
        sla_duration: BigInt(d.sla),
        grace_duration: BigInt(d.grace),
        funding_deadline: BigInt(t - (opts.createdAgo ?? 60) + d.funding),
        funded_at: fundedAt == null ? null : BigInt(fundedAt),
        sla_deadline: funded ? BigInt((opts.slaAt ?? fundedAt + d.sla)) : null,
        grace_deadline: funded ? BigInt((opts.graceAt ?? fundedAt + d.sla + d.grace)) : null,
        state: { tag },
        last_attested_status: { tag: "None" },
      };
      w.records.set(id, record);
      return record;
    },
    /** The keeper, the contract and the backend moving a protection along. */
    setState(id, tag) {
      const r = w.records.get(id);
      if (!r) throw new Error("no such protection " + id);
      r.state = { tag };
      if (tag === "Pending" && r.funded_at == null) {
        const t = nowS();
        r.funded_at = BigInt(t);
        r.sla_deadline = BigInt(t + Number(r.sla_duration));
        r.grace_deadline = BigInt(t + Number(r.sla_duration) + Number(r.grace_duration));
      }
    },
    setAnchor(id, status) {
      w.anchor.set(id, status);
    },
  });
})();
