import { ArrowRight, Check, ShieldCheck } from "lucide-react";
import { Amount } from "../../ui/Amount";
import { Badge } from "../../ui/Badge";
import { Card } from "../../ui/Card";
import { StatusBadge } from "../../ui/StatusBadge";
import { SummaryList, SummaryRow } from "../../ui/SummaryList";
import { TimelineCompact, type TimelineStep } from "../../ui/Timeline";
import { cn } from "../../ui/cn";
import { LIFECYCLE } from "../../ui/lifecycle";
import { PayoutCard } from "./PayoutCard";
import { PRODUCT, STEPS as STEP_TITLES, type StageId } from "./copy";

const s = PRODUCT.surface;

/** One product surface, the hero's visual family, at any stage of a cash out. Everything that describes the stage is
 * keyed by it and crossfades in (landing.css `pl-state-in`); the frame, the glow and the payout card stay mounted, so the
 * value visibly moves along the line and the glow fades rather than blinks. `--p` (set by the section) gives the back
 * surface a slight parallax. */
export function ProductStage({ stageId, simulated }: { stageId: StageId; simulated: boolean }) {
  const stage = PRODUCT.stages[stageId];
  const status = LIFECYCLE[stage.status];
  const steps: TimelineStep[] = STEP_TITLES.map((title, i) => ({
    id: title,
    title: i === 3 ? stage.payoutStep : i === 4 ? stage.outcomeStep : title,
    state: stage.steps[i],
    tone: stage.protectedNow ? "seal" : "sapphire",
  }));
  const sent = stageId !== "ready";

  return (
    <div
      role="img"
      aria-label={`Illustration of the Protected Cash Out screen: ${status.label}. ${stage.body}${simulated ? ` ${s.simulatedBadge}.` : ""}`}
      data-product-stage={stageId}
      className="relative isolate mx-auto w-full max-w-[34rem] lg:mx-0 lg:max-w-none"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-[8%] bottom-[20%] top-[16%] -z-10 rounded-full bg-[image:var(--gradient-seal)] blur-[72px] transition-opacity duration-700",
          stage.protectedNow ? "opacity-20" : "opacity-[0.06]",
        )}
      />
      <span
        aria-hidden
        className="absolute bottom-8 left-[14%] right-0 top-0 -z-10 rounded-frame border border-border bg-card/55 [background-image:radial-gradient(var(--color-line-medium)_1px,transparent_1.25px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
        style={{ transform: "translateY(calc((var(--p, 0.5) - 0.5) * -28px))" }}
      />

      <div className="relative pt-12 sm:pr-8 sm:pt-14">
        <div data-stage-chip className="absolute right-0 top-5 z-20 sm:right-3">
          <span key={sent ? "sent" : "ready"} className="pl-state-in inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 text-caption font-medium text-foreground shadow-float">
            <span className={cn("grid size-6 place-items-center rounded-full", sent ? "bg-emerald-50 text-emerald-700" : "bg-seal-50 text-seal-700")}>
              {sent ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <ShieldCheck aria-hidden className="size-3.5" />}
            </span>
            {sent ? s.verified : s.readyChip}
          </span>
        </div>

        <div data-stage-card className="relative z-10 w-[94%] max-w-[26.5rem] sm:w-[84%]">
          <Card tone={stage.protectedNow ? "protected" : "default"} padding="lg" className="bg-card transition-shadow duration-700">
            <div key={stageId} className="pl-state-in flex min-h-[27.5rem] flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{s.eyebrow}</p>
                <span className="flex flex-wrap items-center gap-1.5">
                  {simulated && (
                    <Badge tone="amber" size="sm">
                      {s.simulatedBadge}
                    </Badge>
                  )}
                  <StatusBadge status={stage.status} size="sm" />
                </span>
              </div>
              <p className="mt-6 text-caption text-muted-foreground">{stage.amountLabel}</p>
              <Amount value={s.amount} currency={s.currency} size="xl" className="mt-1" />
              <p className="mt-2 min-h-[3.2em] text-body text-foreground">{stage.body}</p>
              <SummaryList className="mt-5 border-t border-border pt-4">
                <SummaryRow label={s.receiveLabel}>{s.receive}</SummaryRow>
                <SummaryRow label={s.protectionLabel} emphasis="protected" hint={stage.protectionHint}>
                  <Amount value={s.amount} currency={s.currency} size="sm" />
                </SummaryRow>
              </SummaryList>
              <div className="mt-auto pt-6">
                <TimelineCompact steps={steps} />
                {"action" in stage && (
                  // drawn like the app's button, but part of the picture: not focusable, not clickable
                  <span
                    className={cn(
                      "mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[0.9375rem] font-medium",
                      stage.status === "available" ? "bg-seal-500 text-white shadow-glow-seal" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {stage.action}
                    {stage.status === "ready" && <ArrowRight aria-hidden className="size-4" />}
                  </span>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* overlaps only the card's bottom padding, like the hero */}
        <div data-stage-payout className="relative z-20 -mt-6 ml-auto w-[90%] max-w-[21.5rem] sm:w-[64%]">
          <PayoutCard title={s.payoutTitle} status={stage.payout.status} state={stage.payout.state} start={stage.payout.start} band={stage.payout.band} end={stage.payout.end} />
        </div>
      </div>
    </div>
  );
}
