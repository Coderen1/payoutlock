import { Check } from "lucide-react";
import { Amount } from "../../ui/Amount";
import { Card } from "../../ui/Card";
import { StatusBadge } from "../../ui/StatusBadge";
import { SummaryList, SummaryRow } from "../../ui/SummaryList";
import { TimelineCompact, type TimelineStep } from "../../ui/Timeline";
import { PayoutCard } from "./PayoutCard";
import { HERO, STEPS as STEP_TITLES } from "./copy";

const v = HERO.visual;
const STEPS: TimelineStep[] = STEP_TITLES.map((title, i) => ({
  id: title,
  title,
  state: i < v.currentStep ? "done" : i === v.currentStep ? "current" : "upcoming",
  tone: "seal",
}));

/** The product, drawn from the app's own components rather than photographed: a protected cash out while the bank
 * payout is processing. Layers, back to front: a restrained seal glow, a dotted surface for depth, the cash-out card,
 * and two pieces that sit on its padding (never on its content): the payment check above, the payout below. The
 * payout card carries the settlement line in miniature — the page's motif, entering the product. One picture for
 * assistive technology (role="img"); motion is a single entrance and one travelling dot (landing.css). */
export function HeroVisual() {
  return (
    <div role="img" aria-label={v.description} data-hero-visual className="relative isolate mx-auto w-full max-w-[34rem] lg:mx-0 lg:max-w-none">
      <span aria-hidden className="pl-glow absolute inset-x-[8%] bottom-[20%] top-[16%] -z-10 rounded-full bg-[image:var(--gradient-seal)] opacity-20 blur-[72px]" />
      <span
        aria-hidden
        className="pl-rise absolute bottom-8 left-[14%] right-0 top-0 -z-10 rounded-frame border border-border bg-card/55 [background-image:radial-gradient(var(--color-line-medium)_1px,transparent_1.25px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
      />

      <div className="relative pt-12 sm:pr-8 sm:pt-14">
        <div data-hero-chip className="pl-rise absolute right-0 top-5 z-20 sm:right-3" style={{ animationDelay: "0.34s" }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-1.5 pr-3.5 text-caption font-medium text-foreground shadow-float">
            <span className="grid size-6 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <Check aria-hidden className="size-3.5" strokeWidth={3} />
            </span>
            {v.verified}
          </span>
        </div>

        <div data-hero-card className="pl-rise relative z-10 w-[94%] max-w-[26.5rem] sm:w-[84%]" style={{ animationDelay: "0.1s" }}>
          <Card tone="protected" padding="lg" className="bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{v.eyebrow}</p>
              <StatusBadge status="active" size="sm" />
            </div>
            <p className="mt-7 text-caption text-muted-foreground">{v.sendLabel}</p>
            <Amount value={v.amount} currency={v.currency} size="xl" className="mt-1" />
            <SummaryList className="mt-6 border-t border-border pt-4">
              <SummaryRow label={v.receiveLabel}>{v.receive}</SummaryRow>
              <SummaryRow label={v.protectionLabel} emphasis="protected" hint={v.protectionHint}>
                <Amount value={v.amount} currency={v.currency} size="sm" />
              </SummaryRow>
            </SummaryList>
            <TimelineCompact steps={STEPS} className="mt-6" />
          </Card>
        </div>

        {/* overlaps only the card's bottom padding (-mt-6 < the card's 24–32px padding) */}
        <div data-hero-payout className="pl-rise relative z-20 -mt-6 ml-auto w-[90%] max-w-[21.5rem] sm:w-[64%]" style={{ animationDelay: "0.48s" }}>
          <PayoutCard title={v.payout.title} status={v.payout.status} state="processing" start={v.payout.start} band={v.payout.band} end={v.payout.end} />
        </div>
      </div>

      <p className="mt-4 text-right font-mono text-mono uppercase tracking-[0.08em] text-subtle sm:pr-8">{v.caption}</p>
    </div>
  );
}
