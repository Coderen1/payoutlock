import { Check } from "lucide-react";
import { Amount } from "../../../ui/Amount";
import { Badge } from "../../../ui/Badge";
import { Container } from "../../../ui/Container";
import { HashChip } from "../../../ui/HashChip";
import { StatusBadge } from "../../../ui/StatusBadge";
import { Reveal } from "../Reveal";
import { VERIFY } from "../copy";
import { CLAIMED_RECORD, CONTRACT_ID, SETTLED_RECORD, explorerContract, explorerTx, formatRecordedDate, type ProofRecord } from "../proof";

/** Proof, not a promise: the real contract and two real cash outs on Stellar Testnet, shown as receipts on the hero's
 * surface. Every hash is real and opens on the explorer (`npm run proof:verify` checks them against Horizon). Unlike the
 * hero's picture, this is working UI: the chips copy and link. */
export function Verifiable() {
  return (
    <section id="verify" data-section="verify" data-technical aria-labelledby="verify-title" className="py-[clamp(4.5rem,8vw,7rem)]">
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 xl:gap-20">
        <Reveal>
          <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{VERIFY.eyebrow}</p>
          <h2 id="verify-title" className="mt-4 text-display-m text-foreground">
            {VERIFY.title} <span className="text-muted-foreground">{VERIFY.titleContinued}</span>
          </h2>
          <p className="mt-5 max-w-[30rem] text-lead text-muted-foreground">{VERIFY.body}</p>
          <div className="mt-8 flex max-w-[30rem] flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y border-border py-5">
            <span>
              <span className="block text-body font-medium text-foreground">{VERIFY.contractLabel}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-amber-600" />
                {VERIFY.network}
              </span>
            </span>
            <HashChip value={CONTRACT_ID} label="protection contract" href={explorerContract(CONTRACT_ID)} head={5} tail={5} />
          </div>
          <p className="mt-5 max-w-[30rem] text-caption text-subtle">{VERIFY.note}</p>
        </Reveal>

        <div data-proof-surface className="relative isolate">
          <span aria-hidden className="absolute inset-x-[10%] bottom-[18%] top-[18%] -z-10 rounded-full bg-[image:var(--gradient-seal)] opacity-[0.12] blur-[72px]" />
          <span
            aria-hidden
            className="absolute bottom-6 left-[12%] right-0 top-6 -z-10 rounded-frame border border-border bg-card/55 [background-image:radial-gradient(var(--color-line-medium)_1px,transparent_1.25px)] [background-size:20px_20px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
          />
          <div className="grid gap-4 py-2 sm:pr-8">
            <Receipt kind="settled" record={SETTLED_RECORD} className="sm:w-[88%]" />
            <Receipt kind="claimed" record={CLAIMED_RECORD} className="sm:ml-auto sm:w-[88%]" />
          </div>
        </div>
      </Container>
    </section>
  );
}

function Receipt({ kind, record, className }: { kind: "settled" | "claimed"; record: ProofRecord; className?: string }) {
  const copy = VERIFY[kind];
  return (
    <article data-receipt={kind} aria-labelledby={`receipt-${kind}`} className={`rounded-card border border-border bg-card p-5 shadow-float sm:p-6 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`receipt-${kind}`} className="flex items-center gap-2">
          <StatusBadge status={kind} size="sm" />
          <span className="sr-only">{copy.title} cash out</span>
        </h3>
        <span className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">
          {VERIFY.network} · {formatRecordedDate(record.recordedAt)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Amount value={record.amount} currency="USDC" size="lg" />
        <span className="text-caption text-muted-foreground">{copy.detail}</span>
      </div>
      {"simulated" in copy && (
        <Badge tone="amber" size="sm" className="mt-3">
          {copy.simulated}
        </Badge>
      )}
      <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-caption text-muted-foreground">
        {copy.steps.map((step, i) => (
          <li key={step} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden className="hidden h-px w-3 bg-border-strong sm:block" />}
            <Check aria-hidden className="size-3.5 text-emerald-700" strokeWidth={3} />
            {step}
          </li>
        ))}
      </ol>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-caption text-subtle">{copy.tx}</span>
        <HashChip value={record.outcomeTx} label={`${copy.title.toLowerCase()} transaction`} href={explorerTx(record.outcomeTx)} />
      </div>
    </article>
  );
}
