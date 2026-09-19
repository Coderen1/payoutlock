import { useState } from "react";
import { GallerySection, Specimen } from "../GallerySection";
import { Card } from "../../ui/Card";
import { StatusBadge } from "../../ui/StatusBadge";
import { Timeline, TimelineCompact, type TimelineStep } from "../../ui/Timeline";
import { cn } from "../../ui/cn";
import type { LifecycleStatus } from "../../ui/lifecycle";

interface Scenario {
  id: string;
  label: string;
  badge: LifecycleStatus;
  steps: TimelineStep[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "verifying",
    label: "Verifying funding",
    badge: "verifying",
    steps: [
      { id: "prep", title: "Preparing", description: "Your protected cash out is set up.", time: "14:02", state: "done" },
      { id: "fund", title: "Funding verified", description: "Confirming your payment on Stellar…", state: "current" },
      { id: "active", title: "Protection active", state: "upcoming" },
      { id: "payout", title: "Fiat payout processing", state: "upcoming" },
      { id: "outcome", title: "Settled", state: "upcoming" },
    ],
  },
  {
    id: "active",
    label: "Protection active",
    badge: "active",
    steps: [
      { id: "prep", title: "Preparing", time: "14:02", state: "done" },
      { id: "fund", title: "Funding verified", description: "Your payment is verified on Stellar.", time: "14:03", state: "done" },
      { id: "active", title: "Protection active", description: "1.00 USDC is covered by locked collateral.", time: "14:03", state: "done" },
      { id: "payout", title: "Fiat payout processing", description: "Your bank payout is being processed.", state: "current", tone: "seal" },
      { id: "outcome", title: "Settled", state: "upcoming" },
    ],
  },
  {
    id: "delayed",
    label: "Payout delayed",
    badge: "delayed",
    steps: [
      { id: "prep", title: "Preparing", time: "14:02", state: "done" },
      { id: "fund", title: "Funding verified", time: "14:03", state: "done" },
      { id: "active", title: "Protection active", time: "14:03", state: "done" },
      { id: "payout", title: "Payout delayed", description: "Taking longer than expected. Protection unlocks at 15:33.", state: "attention" },
      { id: "outcome", title: "Protection available", state: "upcoming" },
    ],
  },
  {
    id: "available",
    label: "Protection available",
    badge: "available",
    steps: [
      { id: "prep", title: "Preparing", time: "14:02", state: "done" },
      { id: "fund", title: "Funding verified", time: "14:03", state: "done" },
      { id: "active", title: "Protection active", time: "14:03", state: "done" },
      { id: "payout", title: "Payout didn’t arrive in time", time: "15:33", state: "done" },
      { id: "outcome", title: "Protection available", description: "Claim your 1.00 USDC coverage.", state: "current", tone: "seal" },
    ],
  },
  {
    id: "settled",
    label: "Settled",
    badge: "settled",
    steps: [
      { id: "prep", title: "Preparing", time: "14:02", state: "done" },
      { id: "fund", title: "Funding verified", time: "14:03", state: "done" },
      { id: "active", title: "Protection active", time: "14:03", state: "done" },
      { id: "payout", title: "Fiat payout processed", time: "14:11", state: "done" },
      { id: "outcome", title: "Settled", description: "Your bank payout completed.", time: "14:11", state: "done" },
    ],
  },
  {
    id: "expired",
    label: "Expired",
    badge: "expired",
    steps: [
      { id: "prep", title: "Preparing", time: "14:02", state: "done" },
      { id: "fund", title: "Waiting for your payment", description: "The sending window closed. No funds moved.", state: "attention" },
      { id: "active", title: "Protection active", state: "skipped" },
      { id: "payout", title: "Fiat payout processing", state: "skipped" },
      { id: "outcome", title: "Expired", state: "upcoming" },
    ],
  },
];

export function TimelineSection() {
  const [id, setId] = useState("active");
  const scenario = SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
  return (
    <GallerySection id="timeline" title="Timeline" description="Evidence-driven: what has happened, what is happening, what comes next. Steps draw the line down as they complete. Times and copy here are illustrative.">
      <Specimen label="Scenario" note="switch to see each state">
        <div role="tablist" aria-label="Timeline scenario" className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={s.id === id}
              onClick={() => setId(s.id)}
              className={cn(
                "h-11 rounded-full border px-4 text-caption font-medium transition-colors",
                s.id === id ? "border-foreground bg-foreground text-background" : "border-border-strong bg-card text-foreground hover:bg-surface-hover",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <Specimen label="Timeline">
          <Card tone={scenario.badge === "active" || scenario.badge === "available" ? "protected" : "default"}>
            <div className="mb-6 flex items-center justify-between gap-3">
              <StatusBadge status={scenario.badge} />
              <span className="text-caption text-subtle">illustrative</span>
            </div>
            <Timeline steps={scenario.steps} />
          </Card>
        </Specimen>
        <div className="grid content-start gap-10">
          <Specimen label="Compact" note="narrow screens">
            <TimelineCompact steps={scenario.steps} />
          </Specimen>
          <Specimen label="On a night chapter" night>
            <Timeline steps={scenario.steps} />
          </Specimen>
        </div>
      </div>
    </GallerySection>
  );
}
