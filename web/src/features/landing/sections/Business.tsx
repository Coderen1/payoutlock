import type { ReactNode } from "react";
import { ArrowDown, ArrowRight, Check, Landmark, ShieldCheck, Vault, Wallet } from "lucide-react";
import { Amount } from "../../../ui/Amount";
import { Badge } from "../../../ui/Badge";
import { Container } from "../../../ui/Container";
import { cn } from "../../../ui/cn";
import { NoBreak } from "../NoBreak";
import { Reveal } from "../Reveal";
import { BUSINESS } from "../copy";

const [wallet, offramp] = BUSINESS.customers;

/** Who integrates PayoutLock and how it could pay for itself. The two customers are shown the way their own customers
 * would meet protection — a wallet's cash-out sheet, an off-ramp's payout list — drawn in the product's design
 * language and labelled as illustrations. The business model is one compact flow, marked as a hypothesis. */
export function Business() {
  return (
    <section id="businesses" data-section="business" aria-labelledby="business-title" className="py-[clamp(4.5rem,8vw,7rem)]">
      <Container>
        <Reveal>
          <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{BUSINESS.eyebrow}</p>
          <h2 id="business-title" className="mt-4 max-w-[32ch] text-display-m text-foreground">
            <NoBreak text={BUSINESS.title} />{" "}
            <span className="text-muted-foreground">
              <NoBreak text={BUSINESS.titleContinued} />
            </span>
          </h2>
          <p className="mt-5 max-w-[38rem] text-lead text-muted-foreground">{BUSINESS.audienceNote}</p>
        </Reveal>

        <div className="mt-12 grid gap-5 md:mt-14 lg:grid-cols-2 lg:gap-6">
          <Customer customer={wallet} icon={<Wallet aria-hidden className="size-4" />}>
            <WalletSheet />
          </Customer>
          <Customer customer={offramp} icon={<Landmark aria-hidden className="size-4" />}>
            <PayoutList />
          </Customer>
        </div>
        <p className="mt-4 text-caption text-subtle">{BUSINESS.illustrationNote}</p>

        <Reveal>
          <BusinessModel />
        </Reveal>
      </Container>
    </section>
  );
}

function Customer({ customer, icon, children }: { customer: (typeof BUSINESS.customers)[number]; icon: ReactNode; children: ReactNode }) {
  return (
    <article data-customer={customer.id} className="overflow-hidden rounded-frame border border-border bg-card shadow-card">
      {/* the stage: the customer's own screen, on the dotted surface the hero uses */}
      <div
        aria-hidden
        className="relative grid h-[19rem] place-items-center border-b border-border bg-muted/40 px-6 py-8 [background-image:radial-gradient(var(--color-line-medium)_1px,transparent_1.25px)] [background-size:20px_20px]"
      >
        {children}
      </div>
      <div className="p-6 sm:p-8">
        <h3 className="flex items-center gap-2.5 text-title text-foreground">
          <span className="grid size-8 place-items-center rounded-full bg-muted text-foreground">{icon}</span>
          {customer.name}
        </h3>
        <p className="mt-2 text-body text-muted-foreground">{customer.summary}</p>
        <ul className="mt-5 grid gap-2.5">
          {customer.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-body text-foreground">
              <Check aria-hidden className="mt-1 size-4 shrink-0 text-seal-700" strokeWidth={2.5} />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** A wallet's cash-out sheet with protection shown the way the product shows it. */
function WalletSheet() {
  const s = wallet.surface;
  return (
    <div className="w-full max-w-[21.5rem] rounded-card border border-border bg-card p-5 shadow-float">
      <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{s.title}</p>
      <Amount value={s.amount} currency={s.currency} size="xl" className="mt-3" />
      <p className="mt-1 text-caption text-muted-foreground">{s.to}</p>
      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-control bg-seal-50 px-3 py-2 text-caption font-medium text-seal-700">
        <ShieldCheck aria-hidden className="size-4 shrink-0" />
        <span className="whitespace-nowrap">{s.protectedBy}</span>
        <span className="ml-auto whitespace-nowrap font-normal">{s.covered}</span>
      </p>
      <span className="mt-4 flex h-10 items-center justify-center rounded-full bg-primary text-caption font-medium text-primary-foreground">{s.action}</span>
    </div>
  );
}

/** An off-ramp's payout list: each payout carries its protection. */
function PayoutList() {
  const s = offramp.surface;
  return (
    <div className="w-full max-w-[22rem] rounded-card border border-border bg-card px-5 pb-2 pt-5 shadow-float">
      <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{s.title}</p>
      <ul className="mt-3">
        {s.rows.map((row) => (
          <li key={row.status} className="flex items-center justify-between gap-3 border-t border-border py-3">
            <span className="min-w-0">
              <span className="block text-caption font-medium text-foreground">{row.name}</span>
              <span className="block text-[0.75rem] text-subtle">{row.detail}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={cn("text-[0.75rem] font-medium", row.status === "Delayed" ? "text-amber-700" : row.status === "Settled" ? "text-emerald-700" : "text-sapphire-700")}>{row.status}</span>
              <Badge tone={row.protection === "Protected" ? "seal" : "neutral"} size="sm">
                {row.protection}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const NODE_ICONS = { business: Wallet, payoutlock: ShieldCheck, provider: Vault } as const;

/** Wallet / Off-ramp → PayoutLock → Protection provider, with what could flow along each link. Dashed: a hypothesis. */
function BusinessModel() {
  const { model } = BUSINESS;
  return (
    <div data-business-model className="mt-16 rounded-frame border border-border bg-card p-6 shadow-card sm:p-8 md:mt-20 lg:p-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
        <div className="max-w-[40rem]">
          <Badge tone="amber" size="sm">
            {model.label}
          </Badge>
          <p className="mt-4 text-body text-foreground">{model.body}</p>
        </div>
        <p className="max-w-[22rem] text-caption text-subtle lg:mt-9">{model.caveat}</p>
      </div>
      <ol aria-label="How the business could work" className="mt-8 flex flex-col items-stretch gap-2 md:flex-row md:gap-0">
        {model.nodes.map((node, i) => {
          const Icon = NODE_ICONS[node.id];
          const ours = node.id === "payoutlock";
          return (
            <li key={node.id} className="contents">
              {i > 0 && <ModelLink label={model.links[i - 1]} />}
              <div
                data-model-node={node.id}
                className={cn(
                  "flex items-center gap-3 rounded-card border px-4 py-3 md:min-w-0 md:flex-1 md:flex-col md:items-start md:gap-2",
                  ours ? "border-seal-400/50 bg-seal-50/60" : "border-border bg-background",
                )}
              >
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", ours ? "bg-seal-50 text-seal-700" : "bg-muted text-foreground")}>
                  <Icon aria-hidden className="size-4" />
                </span>
                <span>
                  <span className="block text-body font-semibold text-foreground">{node.name}</span>
                  <span className="block text-caption text-muted-foreground">{node.body}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <p data-model-split className="mt-6 flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-border pt-5 text-caption text-muted-foreground">
        <span className="font-medium text-foreground">{model.split.fee}</span>
        <ArrowRight aria-hidden className="size-3.5 shrink-0" />
        <span className="rounded-full border border-dashed border-border-strong px-3 py-1 text-foreground">{model.split.parts[0]}</span>
        <span aria-hidden>+</span>
        <span className="sr-only">and</span>
        <span className="rounded-full border border-dashed border-seal-400/60 bg-seal-50/60 px-3 py-1 text-seal-700">{model.split.parts[1]}</span>
      </p>
    </div>
  );
}

function ModelLink({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-2 py-1 pl-5 text-caption text-muted-foreground md:w-44 md:shrink-0 md:self-center md:flex-col md:gap-1 md:px-3 md:py-0 md:text-center">
      <ArrowDown aria-hidden className="size-3.5 shrink-0 md:hidden" />
      <span className="whitespace-nowrap">{label}</span>
      <span aria-hidden className="hidden w-full items-center md:flex">
        <span className="h-px flex-1 border-t border-dashed border-border-strong" />
        <ArrowRight className="-ml-1 size-3.5 shrink-0" />
      </span>
    </span>
  );
}
