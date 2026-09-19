import { GallerySection, Specimen } from "../GallerySection";
import { contrastBetween, tokenValue } from "../contrast";
import { cn } from "../../ui/cn";

const COLOR_GROUPS: { title: string; tokens: string[] }[] = [
  { title: "Surfaces", tokens: ["canvas", "surface", "sunken"] },
  { title: "Ink", tokens: ["ink-900", "ink-800", "ink-600", "ink-500"] },
  { title: "Lines", tokens: ["line", "line-medium", "line-strong"] },
  { title: "Night chapters", tokens: ["night-950", "night-800", "night-fg", "night-muted", "night-subtle", "night-line"] },
  { title: "Sapphire · interactive", tokens: ["sapphire-50", "sapphire-600", "sapphire-700"] },
  { title: "Seal · protection only", tokens: ["seal-50", "seal-400", "seal-500", "seal-700"] },
  { title: "Outcome & status", tokens: ["emerald-50", "emerald-600", "emerald-700", "amber-50", "amber-600", "amber-700", "rose-50", "rose-600", "rose-700"] },
];

// [foreground token, background token, minimum ratio, what it is]
const PAIRS: [string, string, number, string][] = [
  ["ink-900", "canvas", 4.5, "Body text on the page"],
  ["ink-900", "surface", 4.5, "Body text on cards"],
  ["ink-600", "surface", 4.5, "Secondary text on cards"],
  ["ink-600", "sunken", 4.5, "Secondary text on wells"],
  ["ink-500", "canvas", 4.5, "Smallest text tone on the page"],
  ["ink-500", "sunken", 4.5, "Smallest text tone on wells"],
  ["white", "ink-900", 4.5, "Primary button"],
  ["white", "ink-800", 4.5, "Primary button, hover"],
  ["sapphire-600", "surface", 4.5, "Links"],
  ["white", "sapphire-600", 4.5, "Text on sapphire fill"],
  ["white", "seal-500", 4.5, "Claim Protection button"],
  ["sapphire-700", "sapphire-50", 4.5, "Info badge / notice"],
  ["seal-700", "seal-50", 4.5, "Protection badge"],
  ["emerald-700", "emerald-50", 4.5, "Settled badge"],
  ["amber-700", "amber-50", 4.5, "Delayed badge, simulated ribbon"],
  ["rose-700", "rose-50", 4.5, "System error"],
  ["night-fg", "night-950", 4.5, "Night: text"],
  ["night-muted", "night-800", 4.5, "Night: secondary text on cards"],
  ["night-subtle", "night-950", 4.5, "Night: smallest text"],
  ["line-strong", "surface", 3, "Input outline (UI boundary, 3:1)"],
];

const TYPE_SCALE = [
  { name: "display-xl", cls: "text-display-xl", sample: "Cash out with confidence." },
  { name: "display-l", cls: "text-display-l", sample: "The settlement gap" },
  { name: "display-m", cls: "text-display-m", sample: "Protection is active" },
  { name: "title", cls: "text-title", sample: "Fiat payout processing" },
  { name: "lead", cls: "text-lead", sample: "PayoutLock protects the last mile between Stellar and fiat." },
  { name: "body", cls: "text-body", sample: "Collateral is locked on Stellar before you send, so the payout is covered while the bank processes it." },
  { name: "caption", cls: "text-caption", sample: "Indicative rate · sandbox anchor" },
  { name: "mono", cls: "font-mono text-mono", sample: "GBBD47IF…H3ZLLFLA5" },
] as const;

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function Swatch({ token }: { token: string }) {
  const value = tokenValue(token);
  return (
    <div className="grid gap-2">
      {/* half canvas, half night, so translucent tokens are readable on both */}
      <div className="h-14 overflow-hidden rounded-control border border-border" style={{ background: "linear-gradient(90deg, var(--color-canvas) 50%, var(--color-night-950) 50%)" }}>
        <div className="h-full w-full" style={{ background: `var(--color-${token})` }} />
      </div>
      <div>
        <p className="font-mono text-mono text-foreground">{token}</p>
        <p className="font-mono text-mono text-subtle">{value}</p>
      </div>
    </div>
  );
}

export function TokensSection() {
  const results = PAIRS.map(([fg, bg, min, use]) => ({ fg, bg, min, use, ratio: contrastBetween(fg, bg) }));
  const failing = results.filter((r) => r.ratio === null || r.ratio < r.min).length;

  return (
    <GallerySection id="tokens" title="Tokens" description="The real values, read from the running stylesheet — nothing here is typed in by hand. Tailwind's default palette is removed, so only these colors exist.">
      {COLOR_GROUPS.map((group) => (
        <Specimen key={group.title} label={group.title}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
            {group.tokens.map((t) => (
              <Swatch key={t} token={t} />
            ))}
          </div>
        </Specimen>
      ))}

      <Specimen label="Contrast, computed" note={failing === 0 ? `All ${results.length} pairs pass WCAG AA` : `${failing} pair(s) FAIL`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left text-caption">
            <thead>
              <tr className="text-subtle">
                <th className="pb-3 font-medium">Pair</th>
                <th className="pb-3 font-medium">Used for</th>
                <th className="pb-3 text-right font-medium">Ratio</th>
                <th className="pb-3 text-right font-medium">Need</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const ok = r.ratio !== null && r.ratio >= r.min;
                return (
                  <tr key={`${r.fg}-${r.bg}`} className="border-t border-border">
                    <td className="border-t border-border py-2.5 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="grid size-6 place-items-center rounded-md border border-border text-[0.7rem] font-semibold" style={{ background: `var(--color-${r.bg})`, color: `var(--color-${r.fg})` }}>
                          Aa
                        </span>
                        <span className="font-mono text-mono">{r.fg} / {r.bg}</span>
                      </span>
                    </td>
                    <td className="border-t border-border py-2.5 pr-4 text-muted-foreground">{r.use}</td>
                    <td className={cn("border-t border-border py-2.5 text-right font-mono text-mono", ok ? "text-emerald-700" : "text-rose-700")}>{r.ratio === null ? "n/a" : `${r.ratio.toFixed(2)}:1`}</td>
                    <td className="border-t border-border py-2.5 text-right font-mono text-mono text-subtle">{r.min}:1</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Specimen>

      <Specimen label="Type scale" note="Geist Variable + Geist Mono, self-hosted">
        <div className="grid gap-7">
          {TYPE_SCALE.map((t) => (
            <div key={t.name} className="grid gap-1.5 border-b border-border pb-7 last:border-0 last:pb-0 lg:grid-cols-[11rem_1fr] lg:gap-8">
              <div className="font-mono text-mono text-subtle">
                <p className="text-foreground">{t.name}</p>
                <p>{cssVar(`--text-${t.name}`)}</p>
                <p>
                  lh {cssVar(`--text-${t.name}--line-height`)}
                  {cssVar(`--text-${t.name}--letter-spacing`) ? ` · ${cssVar(`--text-${t.name}--letter-spacing`)}` : ""}
                  {cssVar(`--text-${t.name}--font-weight`) ? ` · ${cssVar(`--text-${t.name}--font-weight`)}` : ""}
                </p>
              </div>
              <p className={cn(t.cls, "text-foreground")}>{t.sample}</p>
            </div>
          ))}
        </div>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Radius">
          <div className="flex flex-wrap items-end gap-5">
            {[
              ["control", "rounded-control", cssVar("--radius-control")],
              ["card", "rounded-card", cssVar("--radius-card")],
              ["frame", "rounded-frame", cssVar("--radius-frame")],
              ["full", "rounded-full", "9999px"],
            ].map(([name, cls, value]) => (
              <div key={name} className="grid gap-2 text-center">
                <div className={cn("size-20 border border-border-strong bg-sunken", cls)} />
                <p className="font-mono text-mono text-foreground">{name}</p>
                <p className="font-mono text-mono text-subtle">{value}</p>
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen label="Elevation" note="ink-tinted, layered">
          <div className="grid grid-cols-2 gap-5">
            {[
              ["xs", "shadow-xs"],
              ["card", "shadow-card"],
              ["float", "shadow-float"],
              ["glow-seal", "shadow-glow-seal"],
            ].map(([name, cls]) => (
              <div key={name} className="grid gap-2">
                <div className={cn("h-16 rounded-card bg-card", cls)} />
                <p className="font-mono text-mono text-foreground">{name}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-caption text-subtle">glow-seal appears only where value is protected.</p>
        </Specimen>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Spacing" note="4 px unit">
          <div className="grid gap-2.5">
            {[1, 2, 3, 4, 6, 8, 12, 16, 24, 32].map((n) => (
              <div key={n} className="flex items-center gap-4">
                <span className="w-16 font-mono text-mono text-subtle">{n} · {n * 4}px</span>
                <span className="h-3 rounded-sm bg-sapphire-600" style={{ width: n * 4 }} />
              </div>
            ))}
          </div>
        </Specimen>
        <Specimen label="Breakpoints" note="360 px is the smallest supported width">
          <div className="grid gap-2.5 font-mono text-mono">
            {[
              ["xs", cssVar("--breakpoint-xs"), "480"],
              ["sm", cssVar("--breakpoint-sm"), "640"],
              ["md", cssVar("--breakpoint-md"), "768"],
              ["lg", cssVar("--breakpoint-lg"), "1024"],
              ["xl", cssVar("--breakpoint-xl"), "1280"],
              ["2xl", cssVar("--breakpoint-2xl"), "1536"],
            ].map(([name, rem, px]) => (
              <div key={name} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <span className="text-foreground">{name}</span>
                <span className="text-subtle">{rem || "—"} · {px}px</span>
              </div>
            ))}
          </div>
        </Specimen>
      </div>
    </GallerySection>
  );
}
