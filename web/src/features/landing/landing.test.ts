// Pure tests for the landing page: what it says, what it claims, and the timing of its one scripted scene.
// `npm test` (node --test). No browser, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUSINESS, CTA, DEVELOPERS, GAP, HERO, PRODUCT, PUBLIC_COPY, STEPS, TECHNICAL_COPY, VERIFY, allStrings, publicStrings, technicalStrings } from "./copy.ts";
import { CLAIMED_RECORD, CONTRACT_ID, SETTLED_RECORD, explorerContract, explorerTx, formatRecordedDate } from "./proof.ts";
import { ramp } from "./scroll.ts";
import { METRICS, PRICING, TECHNICAL, UNVERIFIED } from "./integrity.ts";
import { RESTING_OPACITY, T, reached } from "./timeline.ts";
import { LIFECYCLE } from "../../ui/lifecycle.ts";

// ---- integrity: nothing here may claim what isn't true

test("no line on the page makes a claim the prototype can't back", () => {
  const offenders = allStrings().filter((s) => UNVERIFIED.test(s) || PRICING.test(s) || METRICS.test(s));
  assert.deepEqual(offenders, []);
});

test("the page never calls the provider role a 'Guarantee Provider' — that's the developers' name for it", () => {
  assert.ok(!allStrings().some((s) => /guarantee/i.test(s)));
  assert.ok(allStrings().some((s) => /protection provider/i.test(s)));
});

test("the sections for everyone use no infrastructure words; the technical ones may", () => {
  assert.deepEqual(publicStrings().filter((s) => TECHNICAL.test(s)), []);
  // ...and the technical sections really are where those words went
  assert.ok(technicalStrings().some((s) => /contract/i.test(s)));
  assert.ok(technicalStrings().some((s) => /attestor/i.test(s)));
  assert.ok(technicalStrings().some((s) => /AwaitingFunding/.test(s)));
});

test("Testnet is stated where a reader first looks, and in the footer's disclaimer", () => {
  assert.match(HERO.eyebrow, /Testnet/);
  assert.match(HERO.note, /Testnet/);
  assert.match(PUBLIC_COPY.FOOTER.disclaimer, /Testnet/);
  assert.match(PUBLIC_COPY.FOOTER.disclaimer, /not a live financial service/);
});

test("the first thirty seconds say what it is, in the words we agreed", () => {
  assert.equal(HERO.title, "Cash out with confidence.");
  assert.equal(HERO.lead, "You send stablecoins to cash out. If the bank payout fails and your money isn't returned, PayoutLock protects you.");
  assert.equal(`${BUSINESS.title} ${BUSINESS.titleContinued}`, "We don't replace wallets or off-ramp providers. We add a protection layer to the cash-out flow they already run.");
});

test("the hero's product is labelled an illustration and uses the product's own vocabulary", () => {
  assert.match(HERO.visual.caption, /Illustration/);
  assert.match(HERO.visual.caption, /Testnet/);
  assert.equal(STEPS[HERO.visual.currentStep], "Fiat payout processing");
  assert.equal(HERO.visual.amount, "1.00");
  assert.match(HERO.visual.description, /Illustration/);
});

test("the business model is presented as a hypothesis, with no price and no claim that anyone pays today", () => {
  const { model } = BUSINESS;
  assert.match(model.label, /hypothesis/i);
  assert.equal(
    model.body,
    "Businesses integrate PayoutLock to offer protected cash-outs. Protection providers supply the capital, and PayoutLock can earn a platform fee from protected transactions.",
  );
  assert.match(model.caveat, /hasn't been validated/);
  assert.match(model.body, /\bcan earn\b/);
  const model_text = [model.label, model.body, model.caveat, ...model.links, model.split.fee, ...model.split.parts, ...model.nodes.flatMap((n) => [n.name, n.body])].join(" ");
  assert.ok(!/we (currently )?charge|our (fee|price|pricing) is|\bis charged\b/i.test(model_text));
  assert.ok(!PRICING.test(model_text));
});

test("the customers are wallets and off-ramp providers, each with what they get, briefly", () => {
  assert.deepEqual(BUSINESS.customers.map((c) => c.name), ["Wallets", "Off-ramp providers"]);
  for (const customer of BUSINESS.customers) {
    assert.equal(customer.points.length, 3, customer.name);
    for (const point of customer.points) assert.ok(point.length <= 70, `${point} is too long to scan`);
  }
  assert.match(BUSINESS.illustrationNote, /no wallet or off-ramp integration is live yet/, "the illustrations don't imply live partners");
});

test("the business model flows Wallet / Off-ramp → PayoutLock → Protection provider", () => {
  assert.deepEqual(BUSINESS.model.nodes.map((n) => n.name), ["Wallet / Off-ramp", "PayoutLock", "Protection provider"]);
  assert.equal(BUSINESS.model.links.length, 2);
  assert.deepEqual(BUSINESS.model.split, { fee: "Protection fee", parts: ["Protection provider compensation", "PayoutLock platform fee"] });
});

test("the calls to action are named as agreed", () => {
  assert.deepEqual({ ...CTA }, { demo: "Launch Demo", app: "Open App", developer: "Developer Console" });
});

test("the developers' section names the contract states, and the provider the way the page does", () => {
  assert.deepEqual([...DEVELOPERS.states, ...DEVELOPERS.terminal].sort(), ["AwaitingFunding", "Claimable", "Claimed", "Expired", "Grace", "Pending", "Refunded", "Settled"]);
  assert.ok(!JSON.stringify(TECHNICAL_COPY.DEVELOPERS).match(/guarantee/i));
  assert.deepEqual(DEVELOPERS.columns.map((c) => c.label), ["Your cash-out flow", "PayoutLock protection", "Stellar · Soroban"]);
});

test("the contract is never said to know about the bank: it acts on attestations and deadlines", () => {
  const all = allStrings().join("\n");
  assert.ok(!/contract (tracks|knows|reads|watches|checks|sees) (the )?(bank|payout)/i.test(all), "no copy says the contract follows the payout");
  assert.match(DEVELOPERS.boundary, /^The contract never sees the bank or holds the user's principal\./);
  const contract = DEVELOPERS.columns[2].items[0].body;
  assert.ok(!/bank|payout status/i.test(contract), contract);
  assert.match(DEVELOPERS.columns[1].items.find((i) => i.id === "attestor")!.body, /anchor's payout status/, "the attestor is the one that reads it");
  assert.match(DEVELOPERS.columns[1].items.find((i) => i.id === "keeper")!.body, /Never claims/);
});

test("the API calls shown are routes the backend really serves", () => {
  assert.deepEqual([...DEVELOPERS.api], ["POST /api/live/open-protection", "GET /api/protections/{anchorWithdrawalId}"]);
});

// ---- the proof: real, checkable, and sparse

test("the proof section shows real Testnet records with well-formed explorer links", () => {
  assert.match(CONTRACT_ID, /^C[A-Z2-7]{55}$/);
  for (const record of [SETTLED_RECORD, CLAIMED_RECORD]) {
    assert.match(record.outcomeTx, /^[0-9a-f]{64}$/);
    assert.equal(explorerTx(record.outcomeTx), `https://stellar.expert/explorer/testnet/tx/${record.outcomeTx}`);
    assert.match(record.amount, /^\d+\.\d{2}$/);
    assert.match(record.recordedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  }
  assert.equal(explorerContract(CONTRACT_ID), `https://stellar.expert/explorer/testnet/contract/${CONTRACT_ID}`);
  assert.notEqual(SETTLED_RECORD.outcomeTx, CLAIMED_RECORD.outcomeTx);
  assert.equal(SETTLED_RECORD.fn, "submit_attestation");
  assert.equal(CLAIMED_RECORD.fn, "claim");
  assert.ok(!SETTLED_RECORD.reference.startsWith("demo_"), "the settled example is a real sandbox-anchor cash out");
  assert.match(VERIFY.claimed.simulated, /Simulated payout failure · real on-chain claim/, "the claimed example says its bank failure was simulated and its claim real");
  assert.match(VERIFY.note, /failure was simulated, but the claim transaction on Stellar is real/);
  assert.equal(`${VERIFY.title} ${VERIFY.titleContinued}`, "This is not just a concept. It is running on Stellar Testnet.");
});

test("record dates read the same everywhere", () => {
  assert.equal(formatRecordedDate("2026-09-19T10:49:42Z"), "19 Sep 2026");
  assert.equal(formatRecordedDate("2026-01-05T23:59:59Z"), "5 Jan 2026");
});

// ---- the settlement-gap panel's pinned moment

/** Evaluates the CSS expressions `ramp` and `reached` produce, the way the browser will. */
function evaluate(expr: string, p: number): number {
  const js = expr.replaceAll("var(--p)", String(p));
  return new Function("clamp", "calc", `return ${js}`)((lo: number, v: number, hi: number) => Math.min(Math.max(v, lo), hi), (x: number) => x) as number;
}

test("a ramp climbs from 0 to 1 between its two points", () => {
  const r = ramp(0.2, 0.4);
  assert.deepEqual([0, 0.2, 0.3, 0.4, 1].map((p) => Math.round(evaluate(r, p) * 100) / 100), [0, 0, 0.5, 1, 1]);
});

test("the panel tells it in order: Stellar, then the gap, then the protection under it, then the claim path", () => {
  assert.ok(T.chain[0] < T.gap[0] && T.chain[1] <= T.gap[0] + 0.05, "the payment settles before the gap opens");
  assert.ok(T.gap[1] <= T.band[0], "the gap is drawn before the band covers it");
  assert.ok(T.band[1] <= T.failure[0], "the claim path comes only after protection is in place");
  assert.ok(T.failure[1] <= 0.95, "and it is fully in before the panel lets go");
  T.phases.forEach((range, i) => {
    if (i > 0) assert.ok(range[0] >= T.phases[i - 1][1], `phase ${i + 1} comes up after phase ${i}`);
  });
  assert.ok(T.phases[1][0] >= T.chain[1] && T.phases[2][0] >= T.band[0], "each phase comes up with its part of the line");
});

test("captions and the claim path are dimmed before their moment, never hidden, and full at the end", () => {
  for (const range of [...T.phases, T.failure]) {
    for (let p = 0; p <= 1.0001; p += 0.01) assert.ok(evaluate(reached(range), p) >= RESTING_OPACITY - 1e-9, `readable at ${p.toFixed(2)}`);
    assert.equal(evaluate(reached(range), 1), 1);
  }
  assert.ok(RESTING_OPACITY >= 0.4);
});

// ---- accuracy: when protection can be claimed, and when it is released

test("the gap panel says a failed payout alone doesn't create a claim, and a return releases protection", () => {
  assert.match(GAP.failure.condition, /deadline/i);
  assert.match(GAP.failure.condition, /nothing returned/i);
  assert.match(GAP.failure.note, /doesn't pay out by itself/);
  assert.match(GAP.failure.note, /only after its deadline passes/);
  assert.match(GAP.failure.returned, /returned instead, protection is released/);
  assert.deepEqual(GAP.line.gap, "Settlement gap");
  assert.match(GAP.line.start.detail, /Stellar · seconds/);
});

test("the product paths: a claim is only ever reached through 'Protection available'", () => {
  const paths = Object.fromEntries(PRODUCT.paths.map((p) => [p.id, [...p.stages]]));
  assert.deepEqual(paths, { arrives: ["ready", "active", "settled"], missed: ["delayed", "available", "claimed"], returned: ["active", "returned"] });
  for (const p of PRODUCT.paths) {
    const at = (p.stages as readonly string[]).indexOf("claimed");
    if (at !== -1) assert.equal(p.stages[at - 1], "available", `${p.id}: claimed only after available`);
  }
  const stages = PRODUCT.stages;
  assert.match(stages.available.body, /deadline passed and nothing was returned/);
  assert.equal("action" in stages.available && stages.available.action, "Claim Protection");
  for (const [id, stage] of Object.entries(stages)) {
    if (id !== "available") assert.notEqual("action" in stage && stage.action, "Claim Protection", `${id} never offers a claim`);
  }
});

test("principal returned is labelled a simulated outcome of the Testnet demo", () => {
  const returned = PRODUCT.paths.find((p) => p.id === "returned")!;
  assert.ok("simulated" in returned && /Simulated outcome in the Testnet demo/.test(returned.simulated));
  assert.ok("simulated" in PRODUCT.stages.returned && PRODUCT.stages.returned.simulated);
  assert.match(PRODUCT.surface.simulatedBadge, /Simulated/);
  for (const p of PRODUCT.paths.filter((p) => p.id !== "returned")) assert.ok(!("simulated" in p), `${p.id} is not simulated`);
});

test("every product stage matches the app: its status, five steps, one step moving, protection shown only while it holds", () => {
  for (const [id, stage] of Object.entries(PRODUCT.stages)) {
    assert.ok(stage.status in LIFECYCLE, id);
    assert.equal(stage.steps.length, 5, id);
    assert.ok(stage.steps.filter((s) => s === "current" || s === "attention").length <= 1, `${id}: at most one step moving`);
    assert.equal(stage.protectedNow, ["active", "delayed", "available"].includes(id), `${id}: protected treatment only while protection holds`);
  }
  assert.equal(PRODUCT.stages.ready.steps[1], "current", "before sending, 'Protection ready' is the step in progress");
  assert.equal(PRODUCT.stages.ready.steps[2], "upcoming", "...and funding hasn't started");
});

test("no contract state names reach the public copy", () => {
  const ENUMS = /\b(AwaitingFunding|Pending|Grace|Claimable|Refunded|Expired)\b/;
  assert.deepEqual(publicStrings().filter((s) => ENUMS.test(s)), []);
});
