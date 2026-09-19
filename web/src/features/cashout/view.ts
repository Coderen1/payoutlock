// Turns "what the chain says" plus "what this browser knows" into what a person sees: a status in plain words,
// a five-step timeline, the one action that makes sense right now, and any notices. Pure — no React, no I/O — so
// every combination can be tested. Contract state names stay in here; nothing user-facing leaks them.
import type { TimelineStep } from "../../ui/Timeline.tsx";
import type { LifecycleStatus } from "../../ui/lifecycle.ts";
import { usesAnchor, type Scenario } from "./scenario.ts";

/** The parts of a protection record the view needs. */
export interface RecordLike {
  state: { tag: string };
  user: string;
  created_at: bigint;
  funded_at: bigint | null;
  funding_deadline: bigint;
  sla_deadline: bigint | null;
  grace_deadline: bigint | null;
  collateral_amount: bigint;
}

export interface ViewInput {
  scenario: Scenario;
  record: RecordLike | null;
  /** This browser sent the payment. Lost on refresh, so a resumed view asks the server instead (fundingCheck). */
  paymentSent: boolean;
  /** Resumed while unfunded: have we asked whether a payment already exists? */
  fundingCheck: "unknown" | "none" | "found";
  /** The anchor's own status for the payout (live/success only). */
  anchorStatus: string | null;
  /** Ledger time, seconds — what the contract compares deadlines against. */
  nowSeconds: number | null;
  connectedAddress: string | null;
  /** A wallet is connected and the app session is valid. */
  signedIn: boolean;
  /** The anchor sign-in is held in memory (lost on refresh). */
  hasAnchorAuth: boolean;
  /** We know where to send the payment. */
  canSend: boolean;
}

export type Cta = { kind: "send" | "claim" | "simulate-refund" | "start-new"; label: string };

export type NoticeKey =
  | "window-closed"
  | "checking-payment"
  | "connect-to-continue"
  | "resume-needs-signin"
  | "confirm-payout-needs-signin"
  | "cannot-resume-payment"
  | "not-owner";

export interface View {
  status: LifecycleStatus;
  title: string;
  description: string;
  steps: TimelineStep[];
  cta: Cta | null;
  terminal: boolean;
  outcome: "settled" | "claimed" | "returned" | "expired" | null;
  /** "Send within" — a countdown to `at` (unix seconds, ledger clock). */
  countdown: { label: string; at: number } | null;
  /** "Your payout is due by" / "Protection unlocks at" — a wall-clock time. */
  deadline: { label: string; at: number } | null;
  /** What the anchor says about the payout, in words. */
  payoutLine: string | null;
  notices: NoticeKey[];
}

const TERMINAL = new Set(["Settled", "Refunded", "Claimed", "Expired"]);
export const isTerminalTag = (tag: string | undefined) => !!tag && TERMINAL.has(tag);

/** 7-decimal stroops -> "1.00", "1.25", "0.1234567": trailing zeros trimmed, never fewer than two decimals. */
export function formatUsdc(stroops: bigint): string {
  const whole = stroops / 10_000_000n;
  const frac = (stroops % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${frac}`;
}

export function formatClock(unixSeconds: number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** The anchor's SEP-6 status, in words, for a payout the chain has not settled yet. null = nothing useful to say.
 * "Completed" here is never the whole story: the protection is only finished once Stellar says Settled, so the line
 * says it is still being finalized. (A settled protection has its own copy, in deriveView.) */
export function describeAnchorStatus(status: string | null): string | null {
  if (!status) return null;
  if (status === "completed") return "Your bank payout completed. Finalizing protection…";
  if (status === "pending_user_transfer_start") return "Waiting for your payment to reach the payout partner.";
  if (status.startsWith("pending_") || status === "incomplete" || status === "on_hold") return "Your bank payout is being processed.";
  if (["error", "expired", "no_market", "too_small", "too_large"].includes(status)) return "The payout partner reported a problem with this payout.";
  if (status === "refunded") return "The payout partner refunded this payout.";
  return null;
}

export function deriveView(input: ViewInput): View {
  const { scenario, record } = input;
  const demoNote = scenario === "failure" ? "this one fails" : scenario === "refund" ? "this one is returned" : null;

  if (!record) {
    return {
      status: "preparing",
      title: "Preparing",
      description: "Getting your protected cash out ready.",
      steps: [
        { id: "prep", title: "Preparing", description: "Setting up your protected cash out.", state: "current" },
        { id: "ready", title: "Protection ready", state: "upcoming" },
        { id: "funding", title: "Funding verified", state: "upcoming" },
        { id: "payout", title: "Fiat payout processing", state: "upcoming" },
        { id: "outcome", title: "Outcome", state: "upcoming" },
      ],
      cta: null,
      terminal: false,
      outcome: null,
      countdown: null,
      deadline: null,
      payoutLine: null,
      notices: [],
    };
  }

  const tag = record.state.tag;
  const amount = formatUsdc(record.collateral_amount);
  const fundedTime = record.funded_at != null ? formatClock(record.funded_at) : undefined;
  const now = input.nowSeconds;
  const windowClosed = now != null && now > Number(record.funding_deadline);
  // What the anchor says about the payout only matters while the payout is in flight — never once the outcome is decided.
  const payoutLine = usesAnchor(scenario) && (tag === "Pending" || tag === "Grace") ? describeAnchorStatus(input.anchorStatus) : null;
  const notices: NoticeKey[] = [];
  const steps: TimelineStep[] = [];

  let status: LifecycleStatus;
  let title: string;
  let description: string;
  let cta: Cta | null = null;
  let countdown: View["countdown"] = null;
  let deadline: View["deadline"] = null;
  let outcome: View["outcome"] = null;

  // The five steps a person sees: Preparing, Protection ready, Funding verified, Fiat payout processing, Outcome.
  // "Protection active" is a status (the headline), not a step: it is what the steps after funding add up to.
  const prep: TimelineStep = { id: "prep", title: "Preparing", description: "Your cash out request is created.", time: formatClock(record.created_at), state: "done" };
  const readyDone: TimelineStep = { id: "ready", title: "Protection ready", description: `${amount} USDC of coverage is locked on Stellar.`, time: formatClock(record.created_at), state: "done" };
  const verified: TimelineStep = { id: "funding", title: "Funding verified", description: "Your payment is verified on Stellar.", time: fundedTime, state: "done" };
  // The payout has been reported complete by the anchor, but Stellar has not settled the protection yet.
  const finalizing = usesAnchor(scenario) && input.anchorStatus === "completed" && (tag === "Pending" || tag === "Grace");

  switch (tag) {
    case "AwaitingFunding": {
      const paid = input.paymentSent || input.fundingCheck === "found";
      if (paid) {
        status = "verifying";
        title = "Verifying funding";
        description = "Payment sent. Confirming it on Stellar.";
      } else if (windowClosed) {
        status = "expired";
        title = "The sending window closed";
        description = "No funds moved. This request is being closed.";
        notices.push("window-closed");
      } else {
        status = "ready";
        title = "Ready to send";
        description = `Send ${amount} USDC to start your protected payout.`;
        countdown = { label: "Send within", at: Number(record.funding_deadline) };
      }
      if (!paid && !windowClosed) {
        if (input.fundingCheck === "unknown") notices.push(input.signedIn ? "checking-payment" : "connect-to-continue");
        else if (input.canSend) cta = { kind: "send", label: `Send ${amount} USDC` };
        else notices.push(usesAnchor(scenario) && !input.hasAnchorAuth ? "resume-needs-signin" : "cannot-resume-payment");
      }
      // Before the payment is sent the person is at "Protection ready" — nothing has been funded yet.
      const closed = windowClosed && !paid;
      steps.push(
        prep,
        paid || closed
          ? readyDone
          : { id: "ready", title: "Protection ready", description: `Coverage is set up. Send ${amount} USDC to continue.`, state: "current" },
        paid
          ? { id: "funding", title: "Funding verified", description: "Confirming your payment on Stellar…", state: "current" }
          : closed
            ? { id: "funding", title: "Payment not received", description: "The sending window closed. No funds moved.", state: "attention" }
            : { id: "funding", title: "Funding verified", state: "upcoming" },
        { id: "payout", title: "Fiat payout processing", state: closed ? "skipped" : "upcoming" },
        { id: "outcome", title: "Outcome", state: "upcoming" },
      );
      break;
    }
    case "Pending":
    case "Grace": {
      if (tag === "Pending" || finalizing) {
        status = "active";
        title = "Protection active";
        description = finalizing
          ? `Your ${amount} USDC is covered.`
          : scenario === "failure"
            ? `Your ${amount} USDC is covered. This scenario simulates the bank payout failing.`
            : scenario === "refund"
              ? `Your ${amount} USDC is covered. Trigger the simulated return below whenever you're ready.`
              : `Your ${amount} USDC is covered while the bank payout is processed.`;
        // A completed payout has no "due by" any more: what is left is for Stellar to record it.
        if (!finalizing && record.sla_deadline != null) deadline = { label: "Your payout is due by", at: Number(record.sla_deadline) };
        if (scenario === "refund") cta = { kind: "simulate-refund", label: "Simulate principal return" };
        if (usesAnchor(scenario) && !input.hasAnchorAuth) notices.push("confirm-payout-needs-signin");
        steps.push(prep, readyDone, verified, {
          id: "payout",
          title: "Fiat payout processing",
          description: payoutLine ?? (demoNote ? `Simulated bank payout: ${demoNote}.` : "Your bank payout is being processed."),
          state: "current",
          tone: "seal",
        }, scenario === "failure"
          ? { id: "outcome", title: "Protection available", description: "It unlocks when the simulated payout fails.", state: "upcoming" }
          : scenario === "refund"
            ? { id: "outcome", title: "Principal returned", description: "When you simulate the return.", state: "upcoming" }
            : { id: "outcome", title: "Outcome", description: finalizing ? "Settles as soon as protection is finalized." : "Settled, or claim your protection if the payout doesn't arrive.", state: "upcoming" });
      } else {
        status = "delayed";
        title = "Payout delayed";
        description = "Taking longer than expected. Your protection is still active and is about to unlock.";
        if (record.grace_deadline != null) deadline = { label: "Protection unlocks at", at: Number(record.grace_deadline) };
        if (scenario === "refund") cta = { kind: "simulate-refund", label: "Simulate principal return" };
        if (usesAnchor(scenario) && !input.hasAnchorAuth) notices.push("confirm-payout-needs-signin");
        steps.push(prep, readyDone, verified, {
          id: "payout",
          title: "Payout delayed",
          description: record.grace_deadline != null ? `Protection unlocks at ${formatClock(record.grace_deadline)}.` : "Protection unlocks soon.",
          state: "attention",
        }, { id: "outcome", title: "Protection available", description: "If the payout still hasn't arrived.", state: "upcoming" });
      }
      break;
    }
    case "Claimable": {
      status = "available";
      title = "Protection available";
      description = `Your payout didn't arrive in time. Claim your ${amount} USDC coverage.`;
      cta = { kind: "claim", label: "Claim Protection" };
      steps.push(prep, readyDone, verified, { id: "payout", title: "Payout didn't arrive in time", state: "done" }, {
        id: "outcome",
        title: "Protection available",
        description: `Claim your ${amount} USDC coverage.`,
        state: "current",
        tone: "seal",
      });
      break;
    }
    case "Settled": {
      status = "settled";
      title = "Settled";
      description = "Your bank payout completed.";
      outcome = "settled";
      steps.push(prep, readyDone, verified, { id: "payout", title: "Fiat payout completed", state: "done" }, { id: "outcome", title: "Settled", description: "Your bank payout completed.", state: "done" });
      break;
    }
    case "Claimed": {
      status = "claimed";
      title = "Claimed";
      description = `Your protection paid ${amount} USDC to your wallet.`;
      outcome = "claimed";
      steps.push(prep, readyDone, verified, { id: "payout", title: "Payout didn't arrive in time", state: "done" }, {
        id: "outcome",
        title: "Claimed",
        description: `${amount} USDC paid to your wallet.`,
        state: "done",
      });
      break;
    }
    case "Refunded": {
      status = "returned";
      title = "Principal returned";
      description = `Your ${amount} USDC was returned to your wallet.`;
      outcome = "returned";
      steps.push(prep, readyDone, verified, { id: "payout", title: demoNote ? "Simulated payout returned" : "Payout returned", state: "done" }, {
        id: "outcome",
        title: "Principal returned",
        description: `${amount} USDC returned to your wallet.`,
        state: "done",
      });
      break;
    }
    default: {
      // Expired (never funded) — and anything unrecognised is shown as closed rather than guessed at.
      status = "expired";
      title = "Expired";
      description = "The sending window closed. No funds moved.";
      outcome = "expired";
      steps.push(
        prep,
        readyDone,
        { id: "funding", title: "Payment not received", description: "The sending window closed. No funds moved.", state: "attention" },
        { id: "payout", title: "Fiat payout processing", state: "skipped" },
        { id: "outcome", title: "Expired", state: "upcoming" },
      );
    }
  }

  const terminal = isTerminalTag(tag);
  if (terminal) cta = { kind: "start-new", label: "Start a new cash out" };
  if (input.connectedAddress && record.user !== input.connectedAddress && !terminal) notices.push("not-owner");

  return { status, title, description, steps, cta, terminal, outcome, countdown, deadline, payoutLine, notices };
}
