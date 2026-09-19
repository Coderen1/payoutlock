// Pure-logic tests: `npm test` (node --test). No browser, wallet, network or chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveView, describeAnchorStatus, formatUsdc, type RecordLike, type ViewInput } from "./view.ts";
import { scenarioFromReference, usesAnchor } from "./scenario.ts";
import { formatCapacity, validateAmount } from "./limits.ts";
import { effectiveMax } from "./liquidity.ts";
import { friendlyError } from "./errors.ts";
import { parseQuote } from "./quote.ts";
import { LAST_CASH_OUT_KEY, clearLastCashOut, loadLastCashOut, saveLastCashOut } from "./storage.ts";
import { formatAmountParts, sanitizeAmount } from "../../ui/amountFormat.ts";

const T0 = 1_800_000_000;
const rec = (tag: string, over: Partial<RecordLike> = {}): RecordLike => ({
  state: { tag },
  user: "GUSER",
  created_at: BigInt(T0),
  funded_at: BigInt(T0 + 60),
  funding_deadline: BigInt(T0 + 600),
  sla_deadline: BigInt(T0 + 3660),
  grace_deadline: BigInt(T0 + 5460),
  collateral_amount: 10_000_000n,
  ...over,
});
const view = (over: Partial<ViewInput> = {}) =>
  deriveView({ scenario: "live", record: rec("Pending"), paymentSent: false, fundingCheck: "none", anchorStatus: null, nowSeconds: T0 + 100, connectedAddress: "GUSER", signedIn: true, hasAnchorAuth: true, canSend: true, ...over });

// ---- every contract state maps to the intended user-facing status

test("each contract state maps to a status a person understands", () => {
  const cases: [string, string][] = [
    ["Pending", "active"], ["Grace", "delayed"], ["Claimable", "available"],
    ["Settled", "settled"], ["Claimed", "claimed"], ["Refunded", "returned"], ["Expired", "expired"],
  ];
  for (const [tag, status] of cases) assert.equal(view({ record: rec(tag) }).status, status, tag);
  assert.equal(view({ record: null }).status, "preparing");
});

test("AwaitingFunding: ready to send -> verifying once paid -> closed after the window", () => {
  const waiting = view({ record: rec("AwaitingFunding", { funded_at: null, sla_deadline: null, grace_deadline: null }) });
  assert.equal(waiting.status, "ready");
  assert.deepEqual(waiting.cta, { kind: "send", label: "Send 1.00 USDC" });
  assert.ok(waiting.countdown && waiting.countdown.at === T0 + 600);
  const paid = view({ record: rec("AwaitingFunding"), paymentSent: true });
  assert.equal(paid.status, "verifying");
  assert.equal(paid.cta, null);
  const closed = view({ record: rec("AwaitingFunding"), nowSeconds: T0 + 601 });
  assert.equal(closed.status, "expired");
  assert.equal(closed.cta, null);
  assert.ok(closed.notices.includes("window-closed"));
  const paidLate = view({ record: rec("AwaitingFunding"), paymentSent: true, nowSeconds: T0 + 601 });
  assert.equal(paidLate.status, "verifying", "a payment that was sent is never shown as expired");
});

// ---- the rule that matters most: Claim only when the chain says Claimable

test("Claim Protection appears if and only if the chain state is Claimable", () => {
  for (const tag of ["AwaitingFunding", "Pending", "Grace", "Settled", "Claimed", "Refunded", "Expired"]) {
    assert.notEqual(view({ record: rec(tag) }).cta?.kind, "claim", tag);
  }
  assert.deepEqual(view({ record: rec("Claimable") }).cta, { kind: "claim", label: "Claim Protection" });
  // client-side hints never conjure it: not the anchor status, not deadlines, not evidence
  assert.notEqual(view({ record: rec("Grace"), nowSeconds: T0 + 999_999, anchorStatus: "pending_anchor" }).cta?.kind, "claim");
});

test("terminal states offer to start a new cash out, and nothing else", () => {
  for (const tag of ["Settled", "Claimed", "Refunded", "Expired"]) {
    const v = view({ record: rec(tag) });
    assert.equal(v.terminal, true, tag);
    assert.equal(v.cta?.kind, "start-new", tag);
  }
});

test("the simulated principal return control exists only in the refund scenario", () => {
  for (const scenario of ["live", "success", "failure"] as const) {
    for (const tag of ["Pending", "Grace"]) assert.notEqual(view({ scenario, record: rec(tag) }).cta?.kind, "simulate-refund", `${scenario}/${tag}`);
  }
  assert.equal(view({ scenario: "refund", record: rec("Pending") }).cta?.kind, "simulate-refund");
  assert.equal(view({ scenario: "refund", record: rec("Claimable") }).cta?.kind, "claim");
});

// ---- resuming after a refresh

test("resumed while unfunded: never offers Send until the server has been asked about an existing payment", () => {
  const r = rec("AwaitingFunding");
  assert.equal(view({ record: r, fundingCheck: "unknown" }).cta, null);
  assert.ok(view({ record: r, fundingCheck: "unknown" }).notices.includes("checking-payment"));
  assert.ok(view({ record: r, fundingCheck: "unknown", signedIn: false }).notices.includes("connect-to-continue"), "not signed in: asks to connect instead of pretending to check");
  assert.equal(view({ record: r, fundingCheck: "found" }).status, "verifying");
  assert.equal(view({ record: r, fundingCheck: "none" }).cta?.kind, "send");
});

test("resumed without a destination: live asks to sign in again, demo says it cannot continue", () => {
  const r = rec("AwaitingFunding");
  assert.ok(view({ scenario: "live", record: r, canSend: false, hasAnchorAuth: false }).notices.includes("resume-needs-signin"));
  assert.ok(view({ scenario: "failure", record: r, canSend: false, hasAnchorAuth: false }).notices.includes("cannot-resume-payment"));
});

test("a live protection without the anchor sign-in tells the person to sign in again; demo failure does not", () => {
  assert.ok(view({ record: rec("Pending"), hasAnchorAuth: false }).notices.includes("confirm-payout-needs-signin"));
  assert.ok(view({ record: rec("Grace"), hasAnchorAuth: false }).notices.includes("confirm-payout-needs-signin"));
  assert.ok(!view({ scenario: "failure", record: rec("Pending"), hasAnchorAuth: false }).notices.includes("confirm-payout-needs-signin"));
  assert.ok(!view({ record: rec("Pending"), hasAnchorAuth: true }).notices.includes("confirm-payout-needs-signin"));
});

test("another wallet looking at an open cash out is told it isn't theirs", () => {
  assert.ok(view({ record: rec("Claimable"), connectedAddress: "GOTHER" }).notices.includes("not-owner"));
  assert.ok(!view({ record: rec("Claimable"), connectedAddress: "GUSER" }).notices.includes("not-owner"));
  assert.ok(!view({ record: rec("Claimable"), connectedAddress: null }).notices.includes("not-owner"));
});

// ---- language: nothing technical reaches a person

test("no view text leaks implementation terms", () => {
  const banned = /FUNDED|nonce|\bSAC\b|advance_to|attest|SEP-\d|Guarantee Provider|Soroban|stroop|AwaitingFunding|Claimable|Pending\b(?!\s)|Refunded|Expired \(/;
  const texts: string[] = [];
  for (const scenario of ["live", "success", "failure", "refund"] as const) {
    for (const tag of ["AwaitingFunding", "Pending", "Grace", "Claimable", "Settled", "Claimed", "Refunded", "Expired"]) {
      for (const anchorStatus of [null, "pending_anchor", "completed", "error"]) {
        const v = view({ scenario, record: rec(tag), anchorStatus });
        texts.push(v.title, v.description, v.cta?.label ?? "", v.payoutLine ?? "", ...v.steps.flatMap((s) => [String(s.title), String(s.description ?? "")]));
      }
    }
  }
  const leaked = texts.filter((t) => banned.test(t));
  assert.deepEqual(leaked, []);
});

test("the timeline always has five steps, exactly one moving forward at a time", () => {
  for (const tag of ["AwaitingFunding", "Pending", "Grace", "Claimable", "Settled", "Claimed", "Refunded", "Expired"]) {
    const v = view({ record: rec(tag) });
    assert.equal(v.steps.length, 5, tag);
    assert.ok(v.steps.filter((s) => s.state === "current").length <= 1, `${tag}: at most one current step`);
  }
});

// ---- helpers

test("USDC formatting trims zeros but never shows fewer than two decimals", () => {
  assert.equal(formatUsdc(10_000_000n), "1.00");
  assert.equal(formatUsdc(12_500_000n), "1.25");
  assert.equal(formatUsdc(1_234_567n), "0.1234567");
  assert.equal(formatUsdc(200_000_000n), "20.00");
});

test("the anchor's payout line is shown only while the payout is in flight", () => {
  for (const tag of ["Pending", "Grace"]) assert.equal(view({ record: rec(tag), anchorStatus: "pending_anchor" }).payoutLine, "Your bank payout is being processed.", tag);
  for (const tag of ["AwaitingFunding", "Claimable", "Settled", "Claimed", "Refunded", "Expired"]) assert.equal(view({ record: rec(tag), anchorStatus: "pending_anchor" }).payoutLine, null, tag);
});

test("anchor statuses become words; unknown ones say nothing", () => {
  assert.equal(describeAnchorStatus("completed"), "Your bank payout completed. Finalizing protection…");
  assert.equal(describeAnchorStatus("pending_anchor"), "Your bank payout is being processed.");
  assert.equal(describeAnchorStatus("pending_user_transfer_start"), "Waiting for your payment to reach the payout partner.");
  assert.equal(describeAnchorStatus("some_new_status"), null);
  assert.equal(describeAnchorStatus(null), null);
});

test("scenarios are told apart by reference", () => {
  assert.equal(scenarioFromReference("demo_failure_abc", "demo"), "failure");
  assert.equal(scenarioFromReference("demo_refund_abc", "demo"), "refund");
  assert.equal(scenarioFromReference("sep_abc", "demo"), "success");
  assert.equal(scenarioFromReference("sep_abc", "live"), "live");
  assert.equal(usesAnchor("live") && usesAnchor("success"), true);
  assert.equal(usesAnchor("failure") || usesAnchor("refund"), false);
});

test("amount validation", () => {
  const o = { min: "1", maxStroops: 20_000_000n };
  assert.equal(validateAmount("1", o), null);
  assert.equal(validateAmount("2", o), null);
  assert.equal(validateAmount("", o), "Enter an amount.");
  assert.equal(validateAmount("0.5", o), "The minimum is 1 USDC.");
  assert.equal(validateAmount("2.01", o), "Protection capacity is currently 2.00 USDC.");
  assert.equal(validateAmount("0", { min: "0.1", maxStroops: null }), "Enter an amount greater than zero.");
  assert.equal(validateAmount("0.1", { min: "0.1", maxStroops: null }), null);
});

test("errors are translated, never dumped", () => {
  assert.equal(friendlyError(new Error("invalid_or_expired_session")).kind, "session");
  assert.equal(friendlyError(new Error("too_many_active_protections_for_wallet")).title, "You already have cash outs in progress");
  assert.match(friendlyError(new Error('SEP-6 withdraw failed: {"error":"Minimum off-ramp is 1.0000000 USDC"}')).message, /minimum cash out is 1 USDC/);
  assert.equal(friendlyError(new Error("User declined access")).kind, "wallet-rejected");
  assert.equal(friendlyError(new Error("Failed to fetch")).kind, "network");
  assert.equal(friendlyError(new Error("Insufficient USDC balance to complete this payment.")).message, "Insufficient USDC balance to complete this payment.");
  const weird = friendlyError(new Error('{"status":500,"trace":"HostError: Error(Contract, #6)"}'));
  assert.equal(weird.title, "Something went wrong");
  assert.ok(!weird.message.includes("HostError"));
});

test("quote parsing", () => {
  const q = parseQuote({ buy_amount: "48.54", sell_amount: "1.0000000", fee: { details: [{ description: "50 bps from the USD/TRY mid rate" }] } });
  assert.deepEqual(q, { receive: "48.54", rate: "48.54", spreadBps: 50 });
  assert.equal(parseQuote({}), null);
  assert.equal(parseQuote({ buy_amount: "0", sell_amount: "1" }), null);
});

test("amount typing is sanitised and formatting never rounds", () => {
  assert.equal(sanitizeAmount("0012,3456abc.7", 2), "12.34");
  assert.equal(sanitizeAmount(".5", 2), "0.5");
  assert.equal(sanitizeAmount("1..", 2), "1.");
  assert.deepEqual(formatAmountParts("1.2345678", 2), { sign: "", whole: "1", frac: "2345678" });
  assert.deepEqual(formatAmountParts("1234.5", 2), { sign: "", whole: "1,234", frac: "50" });
});

// ---- the one thing the browser remembers

test("localStorage holds only {flow, reference} — nothing else can be written or read back", () => {
  const store = new Map<string, string>();
  const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  saveLastCashOut({ flow: "demo", reference: "demo_failure_abc", ...({ jwt: "secret", amount: "1", state: "Pending" } as object) } as never, fake);
  assert.deepEqual(JSON.parse(store.get(LAST_CASH_OUT_KEY)!), { flow: "demo", reference: "demo_failure_abc" });
  assert.deepEqual(loadLastCashOut(fake), { flow: "demo", reference: "demo_failure_abc" });
  store.set(LAST_CASH_OUT_KEY, JSON.stringify({ flow: "live", reference: "x y" }));
  assert.equal(loadLastCashOut(fake), null, "an unsafe reference is rejected");
  store.set(LAST_CASH_OUT_KEY, "not json");
  assert.equal(loadLastCashOut(fake), null);
  saveLastCashOut({ flow: "live", reference: "sep_1" }, fake);
  clearLastCashOut(fake);
  assert.equal(loadLastCashOut(fake), null);
  assert.equal(loadLastCashOut(null), null, "no storage at all is fine");
});

// ---- 1. the card, the payout line and the timeline never contradict each other

/** Everything a person reads about the payout in one view. */
const payoutTexts = (v: ReturnType<typeof view>) => [v.title, v.description, v.payoutLine ?? "", ...v.steps.flatMap((s) => [String(s.title), String(s.description ?? "")])];

test("payout processing: the card says the payout is being processed, never that it completed", () => {
  const v = view({ record: rec("Pending"), anchorStatus: "pending_anchor" });
  assert.equal(v.status, "active");
  assert.equal(v.payoutLine, "Your bank payout is being processed.");
  const payoutStep = v.steps.find((s) => s.id === "payout")!;
  assert.equal(payoutStep.title, "Fiat payout processing");
  assert.equal(payoutStep.state, "current");
  assert.ok(!payoutTexts(v).some((t) => /completed/i.test(t)), "no text may claim completion while the payout is processing");
});

test("anchor completed but the chain has not settled: 'completed. Finalizing protection…', nothing else", () => {
  for (const tag of ["Pending", "Grace"]) {
    const v = view({ record: rec(tag), anchorStatus: "completed" });
    assert.equal(v.payoutLine, "Your bank payout completed. Finalizing protection…", tag);
    assert.equal(v.status, "active", `${tag}: not "delayed" while the payout is known complete`);
    assert.equal(v.deadline, null, `${tag}: no "due by" / "unlocks at" for a payout that is done`);
    assert.equal(v.cta, null, tag);
    assert.ok(!payoutTexts(v).some((t) => /being processed|delayed|didn't arrive/i.test(t)), `${tag}: no text says the payout is still pending or late`);
    assert.ok(payoutTexts(v).some((t) => /Finalizing protection/.test(t)), tag);
  }
});

test("Settled: the payout completed, without any 'finalizing' or 'processing' text", () => {
  const v = view({ record: rec("Settled"), anchorStatus: "completed" });
  assert.equal(v.status, "settled");
  assert.equal(v.description, "Your bank payout completed.");
  assert.equal(v.payoutLine, null);
  assert.ok(!payoutTexts(v).some((t) => /Finalizing|being processed|delayed/i.test(t)));
});

test("no combination of chain state and anchor status shows contradictory payout text", () => {
  const states = ["AwaitingFunding", "Pending", "Grace", "Claimable", "Settled", "Claimed", "Refunded", "Expired"];
  const anchorStatuses = [null, "pending_user_transfer_start", "pending_anchor", "pending_receiver", "incomplete", "completed", "refunded", "error", "expired", "mystery"];
  for (const scenario of ["live", "success", "failure", "refund"] as const) {
    for (const tag of states) {
      for (const anchorStatus of anchorStatuses) {
        const v = view({ scenario, record: rec(tag), anchorStatus });
        const texts = payoutTexts(v);
        const where = `${scenario}/${tag}/${anchorStatus}`;
        const says = (re: RegExp) => texts.some((t) => re.test(t));
        // "completed" appears only when the chain settled, or together with "Finalizing protection…"
        if (says(/payout completed/i) && tag !== "Settled") assert.ok(says(/Finalizing protection/), `${where}: "completed" without settling or finalizing`);
        // ...and never next to a claim that the payout is still processing or is late
        if (says(/payout completed/i)) assert.ok(!says(/being processed|Payout delayed|didn't arrive/i), `${where}: completed AND pending/late`);
        // while the timeline says the payout is in progress, no text says it is finished for good
        const payout = v.steps.find((s) => s.id === "payout")!;
        if (payout.title === "Fiat payout processing" && payout.state === "current" && anchorStatus !== "completed") assert.ok(!says(/payout completed/i), `${where}: processing step next to "completed"`);
        // the headline and the primary action agree with the chain
        assert.equal(v.cta?.kind === "claim", tag === "Claimable", `${where}: claim only on Claimable`);
      }
    }
  }
});

// ---- 2. the timeline follows the person, not the contract: nothing is "funded" before the payment is sent

const stepTitles = (v: ReturnType<typeof view>) => v.steps.map((s) => String(s.title));
const stepState = (v: ReturnType<typeof view>, id: string) => v.steps.find((s) => s.id === id)?.state;

test("the lifecycle is Preparing, Protection ready, Funding verified, Fiat payout processing, Outcome", () => {
  const expected = ["Preparing", "Protection ready", "Funding verified", "Fiat payout processing", "Outcome"];
  assert.deepEqual(stepTitles(view({ record: null })), expected);
  assert.deepEqual(stepTitles(view({ record: rec("AwaitingFunding", { funded_at: null }) })), expected);
  assert.deepEqual(stepTitles(view({ record: rec("AwaitingFunding"), paymentSent: true })), expected);
  assert.deepEqual(stepTitles(view({ record: rec("Pending") })), expected);
});

test("AwaitingFunding with no payment: Protection ready is the active step, Funding verified has not started", () => {
  const v = view({ record: rec("AwaitingFunding", { funded_at: null, sla_deadline: null, grace_deadline: null }) });
  assert.equal(v.status, "ready");
  assert.equal(stepState(v, "prep"), "done");
  assert.equal(stepState(v, "ready"), "current");
  assert.equal(stepState(v, "funding"), "upcoming");
  assert.equal(stepState(v, "payout"), "upcoming");
  assert.equal(stepState(v, "outcome"), "upcoming");
});

test("payment sent and being verified: Funding verified is current; FUNDED makes it done", () => {
  const paying = view({ record: rec("AwaitingFunding", { funded_at: null }), paymentSent: true });
  assert.equal(stepState(paying, "ready"), "done");
  assert.equal(stepState(paying, "funding"), "current");
  assert.equal(stepState(paying, "payout"), "upcoming");
  const resumedPaid = view({ record: rec("AwaitingFunding", { funded_at: null }), fundingCheck: "found" });
  assert.equal(stepState(resumedPaid, "funding"), "current");
  const funded = view({ record: rec("Pending") });
  assert.equal(stepState(funded, "ready"), "done");
  assert.equal(stepState(funded, "funding"), "done");
  assert.equal(stepState(funded, "payout"), "current");
});

test("'Funding verified' is done only once the chain is past AwaitingFunding", () => {
  for (const tag of ["AwaitingFunding", "Expired"]) {
    for (const paymentSent of [false, true]) {
      const v = view({ record: rec(tag), paymentSent });
      assert.notEqual(stepState(v, "funding"), "done", `${tag}, paymentSent=${paymentSent}`);
    }
  }
  for (const tag of ["Pending", "Grace", "Claimable", "Settled", "Claimed", "Refunded"]) assert.equal(stepState(view({ record: rec(tag) }), "funding"), "done", tag);
});

test("a window that closed unpaid: the request was ready, payment never arrived, payout skipped", () => {
  const v = view({ record: rec("AwaitingFunding", { funded_at: null }), nowSeconds: T0 + 601 });
  assert.equal(stepState(v, "ready"), "done");
  assert.equal(stepState(v, "funding"), "attention");
  assert.equal(stepState(v, "payout"), "skipped");
});

// ---- 3. provider liquidity preflight

test("effective maximum is the lower of the product cap and the provider's liquidity", () => {
  assert.equal(effectiveMax(20_000_000n, 10_197_233n), 10_197_233n);
  assert.equal(effectiveMax(20_000_000n, 50_000_000n), 20_000_000n);
  assert.equal(effectiveMax(20_000_000n, 20_000_000n), 20_000_000n);
  assert.equal(effectiveMax(20_000_000n, 0n), 0n);
  // an unknown limit never blocks: the backend still checks it
  assert.equal(effectiveMax(20_000_000n, null), 20_000_000n);
  assert.equal(effectiveMax(null, 5_000_000n), 5_000_000n);
  assert.equal(effectiveMax(null, null), null);
});

test("an amount above the effective maximum is refused with the capacity in plain words", () => {
  const cap = effectiveMax(20_000_000n, 10_197_233n);
  const o = { min: "1", maxStroops: cap };
  assert.equal(validateAmount("1", o), null);
  assert.equal(validateAmount("1.0197233", o), null, "exactly the capacity is fine");
  assert.equal(validateAmount("1.0197234", o), "Protection capacity is currently 1.01 USDC.");
  assert.equal(validateAmount("1.02", o), "Protection capacity is currently 1.01 USDC.", "the typed 2-decimal amount is over, and the figure never rounds up");
  assert.equal(validateAmount("1.01", o), null);
  assert.equal(validateAmount("2", o), "Protection capacity is currently 1.01 USDC.");
  assert.equal(validateAmount("1.5", { min: "1", maxStroops: effectiveMax(20_000_000n, 15_000_000n) }), null);
  assert.equal(validateAmount("1.51", { min: "1", maxStroops: effectiveMax(20_000_000n, 15_000_000n) }), "Protection capacity is currently 1.50 USDC.");
});

test("when the provider can't cover even the minimum, every amount says so instead of pointing at the minimum", () => {
  const o = { min: "1", maxStroops: effectiveMax(20_000_000n, 5_000_000n) };
  assert.equal(validateAmount("0.5", o), "Protection capacity is currently 0.50 USDC.");
  assert.equal(validateAmount("1", o), "Protection capacity is currently 0.50 USDC.");
  assert.equal(validateAmount("", o), "Enter an amount.");
  assert.equal(validateAmount("1", { min: "1", maxStroops: effectiveMax(20_000_000n, 0n) }), "Protection capacity is currently 0.00 USDC.");
  assert.equal(formatCapacity(99_999n), "0.00");
  assert.equal(formatCapacity(10_197_233n), "1.01");
  assert.equal(formatCapacity(20_000_000n), "2.00");
});
