import { useRef } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Container } from "../../../ui/Container";
import { StatusBadge } from "../../../ui/StatusBadge";
import { cn } from "../../../ui/cn";
import { useMediaQuery } from "../../../ui/useMediaQuery";
import { NoBreak } from "../NoBreak";
import { SettlementLine } from "../SettlementLine";
import { GAP } from "../copy";
import { ramp, useElementHeight, useScrollProgress, useViewportHeight, vars } from "../scroll";
import { T, reached } from "../timeline";

const LINE_DESCRIPTION =
  "A line in three parts. On the left, you send USDC and it settles on Stellar in seconds. On the right, the bank payout happens off-chain. Between them is the settlement gap, and under it a band shows PayoutLock protection staying in place.";

/** How long the panel holds, in screens of scrolling. Short: the page never feels stuck. */
const HOLD = 0.5;

/** The markers above each phase repeat the line's three parts: solid (Stellar), dashed (the gap), the band (protection). */
const MARKERS = [
  "bg-foreground",
  "bg-[repeating-linear-gradient(90deg,var(--color-amber-600)_0_5px,transparent_5px_10px)]",
  "bg-[image:var(--gradient-seal)]",
];

/** The problem and what covers it, in one dark panel on the warm page. On a wide screen tall enough to hold the panel,
 * it pins for a short moment (half a screen of scrolling) while the line draws and the claim path comes up;
 * everywhere else it scrolls normally and only the line draws as it passes. With less motion, all of it is at rest. */
export function GapSection() {
  const wide = useMediaQuery("(min-width: 1024px)");
  const horizontal = useMediaQuery("(min-width: 768px)");
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const vh = useViewportHeight();
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const panelHeight = useElementHeight(panelRef);

  const pinned = wide && !reduce && panelHeight > 0 && panelHeight + 32 <= vh;
  useScrollProgress(trackRef, { enabled: !reduce, mode: pinned ? "pinned" : "viewport", measure: pinned ? undefined : lineRef });
  const line = pinned
    ? vars({ "--chain": ramp(...T.chain), "--gp": ramp(...T.gap), "--band": ramp(...T.band) })
    : vars({ "--chain": ramp(0.04, 0.26), "--gp": ramp(0.22, 0.62), "--band": ramp(0.6, 0.9) });

  return (
    <section id="gap" data-section="gap" aria-labelledby="gap-title" className="py-[clamp(1.5rem,4vw,3.5rem)]">
      <Container>
        <div ref={trackRef} data-gap-track style={pinned ? { height: panelHeight + Math.round(vh * HOLD) } : undefined}>
          <div
            ref={panelRef}
            data-tone="night"
            data-gap-panel
            className={cn(
              "relative isolate overflow-hidden rounded-frame border border-border px-5 py-10 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_24px_60px_-24px_rgb(11_18_32/0.45)] sm:px-10 sm:py-12 lg:px-14 lg:py-11",
              pinned && "sticky",
            )}
            style={pinned ? { top: Math.max(24, Math.round((vh - panelHeight) / 2)) } : undefined}
          >
            {/* two faint washes of the protection colours — decoration, behind everything */}
            <span aria-hidden className="pointer-events-none absolute -left-40 -top-40 -z-10 size-[28rem] rounded-full bg-sapphire-600 opacity-[0.12] blur-[120px]" />
            <span aria-hidden className="pointer-events-none absolute -bottom-48 right-[4%] -z-10 size-[26rem] rounded-full bg-seal-400 opacity-[0.08] blur-[120px]" />

            <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{GAP.label}</p>
            <h2 id="gap-title" className="mt-4 max-w-[36ch] text-display-m text-foreground">
              <NoBreak text={GAP.title} />
            </h2>

            <div ref={lineRef} className="mt-10">
              <SettlementLine
                orientation={horizontal ? "horizontal" : "vertical"}
                size="compact"
                start={GAP.line.start}
                end={GAP.line.end}
                gap={GAP.line.gap}
                band={GAP.line.band}
                description={LINE_DESCRIPTION}
                style={{ ...line, ...(horizontal ? null : vars({ "--len": "19rem" })) }}
              />
            </div>

            <ol className="mt-10 grid gap-7 md:mt-6 md:grid-cols-3 md:gap-8">
              {GAP.phases.map((phase, i) => (
                <li key={phase.title} data-gap-phase style={pinned ? { opacity: reached(T.phases[i]) } : undefined}>
                  <span aria-hidden className={cn("mb-3 block h-0.5 w-10 rounded-full", MARKERS[i])} />
                  <h3 className="text-body font-medium text-foreground">{phase.title}</h3>
                  <p className="mt-1 max-w-[22rem] text-caption text-muted-foreground">{phase.body}</p>
                </li>
              ))}
            </ol>

            <div
              data-gap-failure
              className="mt-8 border-t border-border pt-7"
              style={pinned ? { opacity: reached(T.failure), transform: `translateY(calc((1 - ${ramp(...T.failure)}) * 12px))` } : undefined}
            >
              <h3 className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{GAP.failure.label}</h3>
              <ol className="mt-5 flex flex-col items-start gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
                <li>
                  <StatusBadge status="delayed" />
                </li>
                <Connector text={GAP.failure.condition} />
                <li>
                  <StatusBadge status="available" />
                </li>
                <Connector text={GAP.failure.claim} />
                <li>
                  <StatusBadge status="claimed" />
                </li>
              </ol>
              <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-muted-foreground">
                <StatusBadge status="returned" size="sm" />
                {GAP.failure.returned}
              </p>
              <p className="mt-3 text-caption text-subtle">{GAP.failure.note}</p>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

/** What has to happen between two states: an arrow down on phones, across from lg up. */
function Connector({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2 pl-3 text-caption text-muted-foreground lg:pl-0">
      <ArrowDown aria-hidden className="size-3.5 shrink-0 lg:hidden" />
      <span aria-hidden className="hidden h-px w-6 bg-border-strong lg:block" />
      {text}
      <ArrowRight aria-hidden className="hidden size-3.5 shrink-0 lg:block" />
    </li>
  );
}
