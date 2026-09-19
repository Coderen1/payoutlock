import { useState } from "react";
import { GallerySection, Specimen } from "../GallerySection";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { StatusBadge } from "../../ui/StatusBadge";
import { Breathe } from "../../ui/motion/Breathe";
import { Crossfade } from "../../ui/motion/Crossfade";
import { Reveal } from "../../ui/motion/Reveal";
import { Stagger, StaggerItem } from "../../ui/motion/Stagger";
import { duration, ease } from "../../ui/motion/tokens";
import { useMediaQuery } from "../../ui/useMediaQuery";
import type { LifecycleStatus } from "../../ui/lifecycle";

const FRAMES: { status: LifecycleStatus; text: string }[] = [
  { status: "verifying", text: "Confirming your payment on Stellar…" },
  { status: "active", text: "Your USDC is covered while the bank payout is processed." },
  { status: "settled", text: "Your bank payout completed." },
];

function EaseCurve() {
  const [x1, y1, x2, y2] = ease;
  const s = 96;
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={s} height={s} aria-label="Ease-out-expo curve" role="img" className="text-sapphire-600">
      <rect x="0.5" y="0.5" width={s - 1} height={s - 1} rx="10" fill="none" className="stroke-border-strong" />
      <path d={`M8 ${s - 8} C ${8 + x1 * (s - 16)} ${s - 8 - y1 * (s - 16)}, ${8 + x2 * (s - 16)} ${s - 8 - y2 * (s - 16)}, ${s - 8} 8`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function MotionSection() {
  const [replay, setReplay] = useState(0);
  const [frame, setFrame] = useState(0);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const current = FRAMES[frame];

  return (
    <GallerySection id="motion" title="Motion" description="Motion explains cause and effect; it never decorates. Only transform, opacity and filter animate. The engine loads lazily, and with reduced motion movement is replaced by a plain fade or nothing.">
      <Specimen label="This browser" note="prefers-reduced-motion">
        <p className="text-body text-foreground">Reduced motion is <strong className="font-semibold">{reduced ? "ON" : "off"}</strong>. {reduced ? "Everything below appears without movement." : "Turn it on in your system settings to see the fallback."}</p>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Reveal" note="scroll-triggered, once">
          <div key={replay} className="grid gap-4">
            <Reveal><Card padding="sm"><p className="text-body">Fades and rises into place.</p></Card></Reveal>
            <Reveal delay={0.1}><Card padding="sm"><p className="text-body">With a slight delay.</p></Card></Reveal>
          </div>
          <Button variant="secondary" size="sm" className="mt-5" onClick={() => setReplay((n) => n + 1)}>Replay</Button>
        </Specimen>
        <Specimen label="Stagger" note="60 ms apart">
          <Stagger key={replay} className="grid gap-3">
            {["Preparing", "Funding verified", "Protection active", "Payout processing"].map((t) => (
              <StaggerItem key={t}><div className="rounded-control border border-border bg-card px-4 py-3 text-body">{t}</div></StaggerItem>
            ))}
          </Stagger>
        </Specimen>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Crossfade" note="a status changing in place">
          <div className="min-h-24">
            <Crossfade id={current.status}>
              <div className="grid justify-items-start gap-3">
                <StatusBadge status={current.status} />
                <p className="text-body text-muted-foreground">{current.text}</p>
              </div>
            </Crossfade>
          </div>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => setFrame((n) => (n + 1) % FRAMES.length)}>Next status</Button>
        </Specimen>
        <Specimen label="Breathe" note="protection glow — that meaning only">
          <Breathe className="rounded-card">
            <Card tone="protected">
              <StatusBadge status="active" />
              <p className="mt-3 text-body text-muted-foreground">The glow pulses slowly while value is protected.</p>
            </Card>
          </Breathe>
        </Specimen>
      </div>

      <Specimen label="Vocabulary">
        <div className="grid items-center gap-8 sm:grid-cols-[auto_1fr]">
          <EaseCurve />
          <div className="grid gap-1.5 font-mono text-mono">
            <p><span className="text-subtle">ease</span> <span className="text-foreground">cubic-bezier({ease.join(", ")})</span></p>
            <p><span className="text-subtle">spring</span> <span className="text-foreground">stiffness 380 · damping 32</span></p>
            <p><span className="text-subtle">duration</span> <span className="text-foreground">{Object.entries(duration).map(([k, v]) => `${k} ${v * 1000}ms`).join(" · ")}</span></p>
          </div>
        </div>
      </Specimen>
    </GallerySection>
  );
}
