import type { ComponentType, ReactNode, SVGProps } from "react";
import { AppWindow, ArrowDown, ArrowRight, Braces, Clock, FileCode, Info, Landmark, Signature } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../../../ui/Button";
import { Container } from "../../../ui/Container";
import { cn } from "../../../ui/cn";
import { NoBreak } from "../NoBreak";
import { Reveal } from "../Reveal";
import { CTA, DEVELOPERS } from "../copy";

const [flow, payoutlock, stellar] = DEVELOPERS.columns;
const L = DEVELOPERS.links;
type Icon = ComponentType<SVGProps<SVGSVGElement>>;
const ICONS: Record<string, Icon> = { app: AppWindow, anchor: Landmark, api: Braces, attestor: Signature, keeper: Clock, contract: FileCode };

/** How it fits, drawn as infrastructure: the cash-out flow a business already runs, the protection PayoutLock adds
 * beside it, and the contract on Stellar that enforces the outcome — with what passes between them. The contract column
 * receives only an open call, signed attestations and deadlines: it never learns about the bank itself.
 *
 * One DOM for every width. From lg up the items and the connectors are placed on a five-column grid (three columns and
 * the two gutters between them); below lg the columns stack in reading order, with one summary connector between each. */
export function Developers() {
  return (
    <section id="developers" data-section="developers" data-technical aria-labelledby="developers-title" className="py-[clamp(3rem,6vw,5rem)]">
      <Container>
        <div
          data-tone="night"
          data-dev-panel
          className="relative isolate overflow-hidden rounded-frame border border-border px-5 py-10 shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_24px_60px_-24px_rgb(11_18_32/0.45)] sm:px-10 sm:py-12 lg:px-14 lg:py-14"
        >
          <span aria-hidden className="pointer-events-none absolute -top-40 right-[4%] -z-10 size-[28rem] rounded-full bg-seal-500 opacity-[0.1] blur-[120px]" />

          <Reveal>
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{DEVELOPERS.eyebrow}</p>
                <h2 id="developers-title" className="mt-4 max-w-[30ch] text-display-m text-foreground">
                  <NoBreak text={DEVELOPERS.title} /> <span className="text-muted-foreground">{DEVELOPERS.titleContinued}</span>
                </h2>
              </div>
              <Button asChild variant="secondary" size="lg" className="self-start lg:self-auto">
                <Link to="/developer">{CTA.developer}</Link>
              </Button>
            </div>
          </Reveal>

          <div data-dev-diagram className="mt-12 grid gap-3 lg:mt-14 lg:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)_7.5rem_minmax(0,1fr)] lg:grid-rows-[auto_repeat(3,minmax(0,1fr))] lg:gap-x-0 lg:gap-y-3">
            {/* column 1: the flow a business already runs */}
            <ColumnHead column={flow} className="lg:col-start-1 lg:row-start-1" />
            <Node item={flow.items[0]} className="lg:col-start-1 lg:row-start-2" />
            <Node item={flow.items[1]} className="lg:col-start-1 lg:row-start-3" />
            <StackLink labels={[L.start, L.status]} />

            {/* column 2: what PayoutLock adds */}
            <ColumnHead column={payoutlock} accent className="mt-3 lg:col-start-3 lg:row-start-1 lg:mt-0" />
            <Node item={payoutlock.items[0]} accent className="lg:col-start-3 lg:row-start-2" />
            <Node item={payoutlock.items[1]} accent className="lg:col-start-3 lg:row-start-3" />
            <Node item={payoutlock.items[2]} accent className="lg:col-start-3 lg:row-start-4" />
            <StackLink labels={[L.open, L.attestation, L.deadline]} />

            {/* column 3: the contract that enforces the outcome */}
            <ColumnHead column={stellar} className="mt-3 lg:col-start-5 lg:row-start-1 lg:mt-0" />
            <Node item={stellar.items[0]} className="lg:col-start-5 lg:row-span-3 lg:row-start-2">
              <p className="mt-5 font-mono text-mono leading-relaxed text-muted-foreground">
                {DEVELOPERS.states.join(" → ")}
                <span className="block text-subtle">{DEVELOPERS.terminal.join(" · ")}</span>
              </p>
            </Node>

            {/* the connectors, from lg up: each row says what passes from left to right */}
            <RowLink label={L.start} className="lg:col-start-2 lg:row-start-2" />
            <RowLink label={L.status} className="lg:col-start-2 lg:row-start-3" />
            <RowLink label={L.open} protected className="lg:col-start-4 lg:row-start-2" />
            <RowLink label={L.attestation} protected className="lg:col-start-4 lg:row-start-3" />
            <RowLink label={L.deadline} protected className="lg:col-start-4 lg:row-start-4" />
          </div>

          <div className="mt-10 grid gap-6 border-t border-border pt-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-12">
            <p data-dev-boundary className="flex max-w-[40rem] items-start gap-2.5 text-body text-foreground">
              <Info aria-hidden className="mt-1 size-4 shrink-0 text-seal-400" />
              <span>
                <NoBreak text={DEVELOPERS.boundary} />
              </span>
            </p>
            <div>
              <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{DEVELOPERS.apiLabel}</p>
              <ul className="mt-2 grid gap-1.5">
                {DEVELOPERS.api.map((call) => (
                  <li key={call}>
                    <code className="inline-block max-w-full rounded-control [overflow-wrap:anywhere] bg-muted px-3 py-1.5 font-mono text-mono text-foreground">{call}</code>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-6 text-caption text-subtle">{DEVELOPERS.limits}</p>
        </div>
      </Container>
    </section>
  );
}

function ColumnHead({ column, accent, className }: { column: (typeof DEVELOPERS.columns)[number]; accent?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 lg:pb-1", className)}>
      <h3 className={cn("text-caption font-semibold", accent ? "text-seal-400" : "text-foreground")}>{column.label}</h3>
      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[0.6875rem] uppercase tracking-[0.06em] text-subtle">{column.tag}</span>
    </div>
  );
}

function Node({ item, accent, className, children }: { item: { id: string; name: string; body: string }; accent?: boolean; className?: string; children?: ReactNode }) {
  const Icon = ICONS[item.id];
  return (
    <div
      data-dev-node={item.id}
      className={cn(
        "rounded-card border bg-card p-4 sm:p-5",
        accent ? "border-seal-400/35 shadow-[0_0_0_1px_rgb(34_199_184/0.08),0_12px_32px_-16px_rgb(34_199_184/0.35)]" : "border-border",
        className,
      )}
    >
      <p className="flex items-center gap-2.5 text-body font-medium text-foreground">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full", accent ? "bg-seal-400/15 text-seal-400" : "bg-muted text-foreground")}>
          <Icon aria-hidden className="size-3.5" />
        </span>
        {item.name}
      </p>
      <p className="mt-2 text-caption text-muted-foreground">{item.body}</p>
      {children}
    </div>
  );
}

/** A labelled arrow across a gutter (lg and up). Seal-coloured where protection flows into the contract. */
function RowLink({ label, protected: isProtected, className }: { label: string; protected?: boolean; className?: string }) {
  return (
    <div aria-hidden className={cn("hidden flex-col justify-center px-2 lg:flex", className)}>
      <span className="text-center text-[0.6875rem] leading-tight text-muted-foreground">{label}</span>
      <span className="mt-1.5 flex items-center">
        <span className={cn("h-px flex-1", isProtected ? "bg-[image:linear-gradient(90deg,var(--color-seal-500),var(--color-seal-400))]" : "bg-border-strong")} />
        <ArrowRight className={cn("-ml-1 size-3.5", isProtected ? "text-seal-400" : "text-subtle")} />
      </span>
    </div>
  );
}

/** Below lg: one arrow between stacked columns, naming everything that passes down it. */
function StackLink({ labels }: { labels: readonly string[] }) {
  return (
    <p aria-hidden className="flex items-center gap-2 py-1 pl-4 text-caption text-muted-foreground lg:hidden">
      <ArrowDown className="size-3.5 shrink-0" />
      {labels.join(" · ")}
    </p>
  );
}
