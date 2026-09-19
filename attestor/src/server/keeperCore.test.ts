// Hermetic tests (no env, secrets or network): keeper rules, fail-safe
// behaviour, and terminal-state slot release against the real store.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  classifyAnchorStatus,
  createKeeper,
  decideKeeperAction,
  isTerminalState,
  releaseTerminalSlots,
  type KeeperDeps,
  type KeeperEntry,
  type KeeperRecord,
} from "./keeperCore.ts";
import { activeProtectionCount, trackProtection, trackedProtectionIds, untrackProtection } from "./store.ts";

const NOW = 10_000;
const BUFFER = 30;
const rec = (tag: string, over: Partial<KeeperRecord> = {}): KeeperRecord => ({
  state: { tag },
  created_at: 1_000n,
  funding_deadline: 2_000n,
  sla_deadline: null,
  grace_deadline: null,
  ...over,
});

// ---------------------------------------------------------------- decisions

test("terminal states — all four — call for slot release", () => {
  for (const tag of ["Settled", "Refunded", "Claimed", "Expired"]) {
    assert.ok(isTerminalState(tag));
    assert.deepEqual(decideKeeperAction(rec(tag), NOW, { expireBufferSeconds: BUFFER }), { kind: "release_slot" });
  }
  for (const tag of ["AwaitingFunding", "Pending", "Grace", "Claimable"]) assert.ok(!isTerminalState(tag));
});

test("Pending advances to Grace only strictly after the SLA deadline (ledger time)", () => {
  const r = rec("Pending", { sla_deadline: 5_000n });
  assert.equal(decideKeeperAction(r, 5_000, { expireBufferSeconds: BUFFER }).kind, "wait");
  assert.equal(decideKeeperAction(r, 5_001, { expireBufferSeconds: BUFFER }).kind, "advance_to_grace");
  assert.equal(decideKeeperAction(rec("Pending"), NOW, { expireBufferSeconds: BUFFER }).kind, "wait"); // no deadline recorded
});

test("Grace advances to Claimable only strictly after the grace deadline", () => {
  const r = rec("Grace", { grace_deadline: 7_000n });
  assert.equal(decideKeeperAction(r, 7_000, { expireBufferSeconds: BUFFER }).kind, "wait");
  assert.equal(decideKeeperAction(r, 7_001, { expireBufferSeconds: BUFFER }).kind, "advance_to_claimable");
});

test("Claimable is never acted on — claiming stays with the User", () => {
  for (const now of [0, NOW, Number.MAX_SAFE_INTEGER]) {
    assert.equal(decideKeeperAction(rec("Claimable"), now, { expireBufferSeconds: BUFFER }).kind, "wait");
  }
});

test("AwaitingFunding expires only after funding_deadline + safety buffer", () => {
  const r = rec("AwaitingFunding"); // deadline 2000
  assert.equal(decideKeeperAction(r, 2_000 + BUFFER, { expireBufferSeconds: BUFFER }).kind, "wait");
  assert.equal(decideKeeperAction(r, 2_000 + BUFFER + 1, { expireBufferSeconds: BUFFER }).kind, "expire_unfunded");
  assert.equal(decideKeeperAction(r, 2_001, { expireBufferSeconds: 0 }).kind, "expire_unfunded");
});

// --------------------------------------------------------------------- tick

function harness(
  records: Record<string, KeeperRecord | null>,
  wallets: Record<string, string> = {},
  kinds: Record<string, string> = {},
) {
  const calls: string[] = [];
  const observed = new Set<string>();
  const slots = new Set<string>(Object.keys(records)); // wallet-slot keys held (idempotent Set semantics)
  let ledgerReads = 0;
  let recordReads = 0;
  let observations = 0;
  const entries = (): KeeperEntry[] =>
    Object.keys(records).map((hex) => ({
      hex,
      walletAddress: wallets[hex] ?? "GWALLET",
      terminalObserved: observed.has(hex),
      kind: kinds[hex] ?? "demo-failure", // the synthetic kinds are unguarded; live is exercised explicitly below
    }));
  const deps: KeeperDeps = {
    listEntries: entries,
    markTerminalObserved: (hex) => void observed.add(hex),
    releaseSlot: (_w, hex) => void slots.delete(hex),
    ledgerNow: async () => {
      ledgerReads++;
      return NOW;
    },
    getRecord: async (hex) => {
      recordReads++;
      return records[hex] ?? null;
    },
    hasFundingEvidence: async () => false,
    observeAnchorStatus: async () => {
      observations++;
      return null; // default: no credentials
    },
    advanceToGrace: async (hex) => {
      calls.push(`grace:${hex}`);
      return "txg";
    },
    advanceToClaimable: async (hex) => {
      calls.push(`claimable:${hex}`);
      return "txc";
    },
    expireUnfunded: async (hex) => {
      calls.push(`expire:${hex}`);
      return "txe";
    },
    log: { info: () => {}, warn: () => {} },
    expireBufferSeconds: BUFFER,
  };
  return { deps, calls, observed, slots, reads: () => ({ ledgerReads, recordReads, observations }) };
}

test("tick with nothing to watch makes no RPC calls at all", async () => {
  const h = harness({});
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(result, { examined: 0, released: 0, advanced: 0, expired: 0, held: 0, errors: 0 });
  assert.equal(h.reads().ledgerReads, 0);
});

test("tick advances Pending→Grace and Grace→Claimable, and never claims", async () => {
  const h = harness({
    aa: rec("Pending", { sla_deadline: 9_000n }),
    bb: rec("Grace", { grace_deadline: 9_500n }),
    cc: rec("Claimable"),
    dd: rec("Pending", { sla_deadline: 20_000n }), // SLA still running
  });
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(h.calls, ["grace:aa", "claimable:bb"]);
  assert.equal(result.advanced, 2);
  assert.equal(result.errors, 0);
});

test("tick expires an unfunded protection past its window and frees the slot", async () => {
  const h = harness({ aa: rec("AwaitingFunding") });
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(h.calls, ["expire:aa"]);
  assert.equal(result.expired, 1);
  assert.ok(!h.slots.has("aa"));
  assert.ok(h.observed.has("aa"));
});

test("tick does NOT expire when a matching payment exists (on-time payment awaiting FUNDED)", async () => {
  const h = harness({ aa: rec("AwaitingFunding") });
  h.deps.hasFundingEvidence = async () => true;
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(h.calls, []);
  assert.equal(result.expired, 0);
  assert.ok(h.slots.has("aa"));
});

test("tick does NOT expire when the funding check itself fails (fail safe)", async () => {
  const h = harness({ aa: rec("AwaitingFunding") });
  h.deps.hasFundingEvidence = async () => {
    throw new Error("horizon down");
  };
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(h.calls, []);
  assert.equal(result.errors, 1);
  assert.ok(h.slots.has("aa"));
});

test("tick releases slots for every terminal state, then stops reading those protections", async () => {
  const h = harness({
    s: rec("Settled"),
    r: rec("Refunded"),
    c: rec("Claimed"),
    e: rec("Expired"),
    p: rec("Pending", { sla_deadline: 20_000n }),
  });
  const keeper = createKeeper(h.deps);
  const first = await keeper.tick();
  assert.equal(first.released, 4);
  for (const k of ["s", "r", "c", "e"]) assert.ok(!h.slots.has(k), `${k} slot released`);
  assert.ok(h.slots.has("p"));

  const before = h.reads().recordReads;
  const second = await keeper.tick(); // idempotent: only the still-active one is re-read
  assert.equal(second.released, 0);
  assert.equal(h.reads().recordReads - before, 1);
});

test("an unreadable record is never treated as terminal", async () => {
  const h = harness({ aa: null });
  const result = await createKeeper(h.deps).tick();
  assert.equal(result.released, 0);
  assert.ok(h.slots.has("aa"));
});

test("losing a race to a manual /developer advance is benign, not an error", async () => {
  const records: Record<string, KeeperRecord | null> = { aa: rec("Pending", { sla_deadline: 9_000n }) };
  const h = harness(records);
  h.deps.advanceToGrace = async (hex) => {
    records[hex] = rec("Grace", { grace_deadline: 20_000n }); // someone else got there first
    throw new Error("Error(Contract, #6)");
  };
  const result = await createKeeper(h.deps).tick();
  assert.equal(result.errors, 0);
  assert.equal(result.advanced, 0);
});

test("a genuine failure is counted, and does not stop the other protections", async () => {
  const h = harness({
    aa: rec("Pending", { sla_deadline: 9_000n }),
    bb: rec("Grace", { grace_deadline: 9_500n }),
  });
  h.deps.advanceToGrace = async () => {
    throw new Error("relayer out of funds"); // state unchanged → real failure
  };
  const result = await createKeeper(h.deps).tick();
  assert.equal(result.errors, 1);
  assert.deepEqual(h.calls, ["claimable:bb"]);
  assert.equal(result.advanced, 1);
});

test("a ledger-time outage skips the whole tick without acting", async () => {
  const h = harness({ aa: rec("Pending", { sla_deadline: 9_000n }) });
  h.deps.ledgerNow = async () => {
    throw new Error("rpc down");
  };
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(h.calls, []);
  assert.equal(result.errors, 1);
});

// ------------------------------------------- slot release vs. the real store

test("a wallet locked out by finished protections is freed before the cap check (all terminal states)", async () => {
  for (const tag of ["Settled", "Refunded", "Claimed", "Expired"]) {
    const wallet = `GTESTWALLET_${tag}`;
    trackProtection(wallet, "id1");
    trackProtection(wallet, "id2");
    assert.equal(activeProtectionCount(wallet), 2, "wallet is at the 2-slot cap");

    const records: Record<string, KeeperRecord> = { id1: rec(tag), id2: rec(tag) };
    const deps = { trackedIds: trackedProtectionIds, getRecord: async (h: string) => records[h] ?? null, releaseSlot: untrackProtection };
    assert.equal(await releaseTerminalSlots(wallet, deps), 2);
    assert.equal(activeProtectionCount(wallet), 0, `${tag}: slots released`);
    assert.equal(await releaseTerminalSlots(wallet, deps), 0, `${tag}: second release is a no-op`);
  }
});

test("slot release keeps slots for active protections and for unreadable records", async () => {
  const wallet = "GTESTWALLET_MIXED";
  for (const id of ["done", "live", "unknown"]) trackProtection(wallet, id);
  const records: Record<string, KeeperRecord | null> = { done: rec("Claimed"), live: rec("Grace"), unknown: null };
  const released = await releaseTerminalSlots(wallet, {
    trackedIds: trackedProtectionIds,
    getRecord: async (h) => records[h] ?? null,
    releaseSlot: untrackProtection,
  });
  assert.equal(released, 1);
  assert.deepEqual(trackedProtectionIds(wallet).sort(), ["live", "unknown"]);
});

// ------------------------------------------- live guard: anchor observation

const GRACE_PAST = { grace_deadline: 9_500n }; // NOW is 10_000 -> the grace deadline has passed
const liveGrace = (over: Partial<KeeperRecord> = {}) => harness({ aa: rec("Grace", { ...GRACE_PAST, ...over }) }, {}, { aa: "live" });

test("classifyAnchorStatus: only statuses that positively mean 'not delivered' are unresolved", () => {
  for (const s of ["completed", "refunded"]) assert.equal(classifyAnchorStatus(s), "resolved", s);
  for (const s of ["pending_anchor", "pending_external", "pending_stellar", "pending_user_transfer_start", "on_hold", "incomplete", "error", "expired", "no_market", "too_small", "too_large"]) {
    assert.equal(classifyAnchorStatus(s), "unresolved", s);
  }
  for (const s of ["", "Completed", "COMPLETED", "some_new_status", null, undefined, 42, {}]) {
    assert.equal(classifyAnchorStatus(s), "unknown", String(s));
  }
});

test("live Grace, deadline passed, fresh observation says unresolved -> advances to Claimable", async () => {
  for (const status of ["pending_anchor", "pending_external", "on_hold", "error"]) {
    const h = liveGrace();
    h.deps.observeAnchorStatus = async () => status;
    const result = await createKeeper(h.deps).tick();
    assert.deepEqual(h.calls, ["claimable:aa"], status);
    assert.equal(result.advanced, 1);
    assert.equal(result.held, 0);
  }
});

test("live Grace: NO credentials -> held in Grace, nothing advances", async () => {
  const h = liveGrace();
  h.deps.observeAnchorStatus = async () => null;
  const result = await createKeeper(h.deps).tick();
  assert.deepEqual(h.calls, []);
  assert.equal(result.held, 1);
  assert.equal(result.advanced, 0);
  assert.equal(result.errors, 0, "failing to observe is the fail-safe, not an error");
});

test("live Grace: lookup FAILS (expired/rejected token, network, anchor error) -> held, never 'unresolved'", async () => {
  for (const message of ["SEP-6 transaction lookup failed: 401", "JWT expired", "fetch failed", "anchor 500"]) {
    const h = liveGrace();
    h.deps.observeAnchorStatus = async () => {
      throw new Error(message);
    };
    const result = await createKeeper(h.deps).tick();
    assert.deepEqual(h.calls, [], message);
    assert.equal(result.held, 1, message);
    assert.equal(result.errors, 0, message);
  }
});

test("live Grace: the anchor says the payout is resolved (completed / refunded) -> held", async () => {
  for (const status of ["completed", "refunded"]) {
    const h = liveGrace();
    h.deps.observeAnchorStatus = async () => status;
    const result = await createKeeper(h.deps).tick();
    assert.deepEqual(h.calls, [], status);
    assert.equal(result.held, 1, status);
  }
});

test("live Grace: an unrecognised or malformed status -> held", async () => {
  for (const status of ["some_future_status", "", "Completed"]) {
    const h = liveGrace();
    h.deps.observeAnchorStatus = async () => status;
    const result = await createKeeper(h.deps).tick();
    assert.deepEqual(h.calls, [], JSON.stringify(status));
    assert.equal(result.held, 1, JSON.stringify(status));
  }
});

test("the guard only applies where it must: demo kinds never consult the anchor, live Pending->Grace is unguarded", async () => {
  for (const kind of ["demo-failure", "demo-refund"]) {
    const h = harness({ aa: rec("Grace", GRACE_PAST) }, {}, { aa: kind });
    await createKeeper(h.deps).tick();
    assert.deepEqual(h.calls, ["claimable:aa"], `${kind} still progresses automatically`);
    assert.equal(h.reads().observations, 0, `${kind} never observes the anchor`);
  }
  const live = harness({ aa: rec("Pending", { sla_deadline: 9_000n }) }, {}, { aa: "live" });
  await createKeeper(live.deps).tick();
  assert.deepEqual(live.calls, ["grace:aa"], "Pending -> Grace stays automatic for live (a Settled attestation is still accepted in Grace)");
  assert.equal(live.reads().observations, 0);
});

test("live Grace before its deadline is not observed at all (no needless anchor traffic)", async () => {
  const h = harness({ aa: rec("Grace", { grace_deadline: 20_000n }) }, {}, { aa: "live" });
  await createKeeper(h.deps).tick();
  assert.equal(h.reads().observations, 0);
  assert.deepEqual(h.calls, []);
});

test("a held live protection is re-checked every tick and advances once the anchor reports it unresolved", async () => {
  const h = liveGrace();
  let status: string | null = null;
  h.deps.observeAnchorStatus = async () => status;
  const keeper = createKeeper(h.deps);
  assert.equal((await keeper.tick()).held, 1);
  assert.equal((await keeper.tick()).held, 1);
  assert.deepEqual(h.calls, []);
  status = "pending_anchor";
  assert.equal((await keeper.tick()).advanced, 1);
  assert.deepEqual(h.calls, ["claimable:aa"]);
});

test("holding logs when the reason first appears, not on every tick", async () => {
  const h = liveGrace();
  const lines: string[] = [];
  h.deps.log = { info: (m) => lines.push(m), warn: (m) => lines.push(m) };
  const keeper = createKeeper(h.deps);
  for (let i = 0; i < 5; i++) await keeper.tick();
  assert.equal(lines.filter((l) => l.includes("holding")).length, 1);
});

// --------------------------------------------- the keeper never claims

test("the keeper has no way to call claim(): not in its dependencies, not in its source", () => {
  const h = harness({});
  assert.ok(!Object.keys(h.deps).some((k) => /^claim$/i.test(k)), "KeeperDeps exposes no claim()");
  for (const file of ["keeperCore.ts", "keeper.ts"]) {
    const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/\bclaim\s*\(/.test(src), `${file} never calls claim()`);
    assert.ok(!/import\s*\{[^}]*\bclaim\b[^}]*\}\s*from/.test(src), `${file} does not import claim`);
  }
});
