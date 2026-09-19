/** Which flow the browser remembers: the real product (`/app`) or the demo scenarios (`/app/demo`). */
export type FlowMode = "live" | "demo";

/**
 * live     /app          the real Protected Cash Out, against the sandbox anchor
 * success  /app/demo     the same live flow, run as a demo: the sandbox anchor completes the payout
 * failure  /app/demo     a simulated bank payout failure -> the protection unlocks -> claim
 * refund   /app/demo     a simulated principal return
 *
 * Only `live` and `success` involve the anchor. `failure` and `refund` use the backend's demo routes, where the
 * fiat side is simulated (the mock anchor can neither fail a payout nor refund principal).
 */
export type Scenario = "live" | "success" | "failure" | "refund";

export const DEMO_SCENARIOS: Scenario[] = ["success", "failure", "refund"];

export function usesAnchor(scenario: Scenario): boolean {
  return scenario === "live" || scenario === "success";
}

/** Demo references are synthetic (`demo_failure_…`, `demo_refund_…`); anything else came from the anchor. */
export function scenarioFromReference(reference: string, mode: FlowMode): Scenario {
  if (reference.startsWith("demo_failure_")) return "failure";
  if (reference.startsWith("demo_refund_")) return "refund";
  return mode === "demo" ? "success" : "live";
}

/** Protection windows for the live flow, in seconds. The demo routes apply their own (short) defaults. */
export const LIVE_DURATIONS = { funding: 600, sla: 3600, grace: 1800 } as const;

export const SCENARIO_COPY: Record<Scenario, { title: string; blurb: string; timing: string }> = {
  live: {
    title: "Protected Cash Out",
    blurb: "Send USDC, receive TRY by bank transfer, and stay covered while the payout is processed.",
    timing: "Send within 10 minutes. If your bank payout hasn't arrived after about an hour, your protection starts to unlock, and about 30 minutes later you can claim it.",
  },
  success: {
    title: "Successful payout",
    blurb: "The sandbox anchor completes the payout. Your protection is confirmed settled and released.",
    timing: "The sandbox anchor usually completes within seconds of your payment.",
  },
  failure: {
    title: "Simulated payout failure",
    blurb: "The bank payout is simulated to fail. Your protection unlocks and you claim it.",
    timing: "After your payment is verified, your protection unlocks in about a minute or two.",
  },
  refund: {
    title: "Simulated principal return",
    blurb: "The bank payout is simulated to be returned. Your USDC comes back to your wallet.",
    timing: "After your payment is verified, you trigger the simulated return yourself.",
  },
};
