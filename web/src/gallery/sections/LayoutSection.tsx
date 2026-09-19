import { GallerySection, Specimen } from "../GallerySection";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { Container } from "../../ui/Container";
import { Cluster, Stack } from "../../ui/Stack";
import { StickyActionBar } from "../../ui/StickyActionBar";
import { useMediaQuery } from "../../ui/useMediaQuery";
import { cn } from "../../ui/cn";

const BREAKPOINTS: [string, string][] = [
  ["2xl", "(min-width: 96rem)"],
  ["xl", "(min-width: 80rem)"],
  ["lg", "(min-width: 64rem)"],
  ["md", "(min-width: 48rem)"],
  ["sm", "(min-width: 40rem)"],
  ["xs", "(min-width: 30rem)"],
];

function ActiveBreakpoint() {
  const matches = [
    useMediaQuery(BREAKPOINTS[0][1]),
    useMediaQuery(BREAKPOINTS[1][1]),
    useMediaQuery(BREAKPOINTS[2][1]),
    useMediaQuery(BREAKPOINTS[3][1]),
    useMediaQuery(BREAKPOINTS[4][1]),
    useMediaQuery(BREAKPOINTS[5][1]),
  ];
  const index = matches.findIndex(Boolean);
  const active = index === -1 ? "base (< 480)" : BREAKPOINTS[index][0];
  return <span className="font-mono text-mono text-foreground">{active}</span>;
}

export function LayoutSection() {
  const touch = useMediaQuery("(pointer: coarse)");
  return (
    <GallerySection id="layout" title="Responsive primitives" description="Gutters are 20 / 32 / 48 px, content caps at 1200 (marketing), 720 (reading) or 520 (the product card). Nothing may scroll horizontally down to 360 px.">
      <Specimen label="Container widths" note="width = min(viewport − gutters, cap)">
        <div className="grid gap-3">
          {(["content", "narrow", "app"] as const).map((size) => (
            <Container key={size} size={size} className="rounded-control border border-dashed border-sapphire-600/50 bg-sapphire-50 px-4 py-2.5 text-center font-mono text-mono text-sapphire-700">
              {size} · {size === "content" ? "1200" : size === "narrow" ? "720" : "520"}px cap
            </Container>
          ))}
        </div>
        <p className="mt-4 text-caption text-subtle">Active breakpoint: <ActiveBreakpoint /> · pointer: {touch ? "coarse (touch)" : "fine"}</p>
      </Specimen>

      <div className="grid gap-10 lg:grid-cols-2">
        <Specimen label="Stack" note="gap in 4 px steps">
          <Stack gap={3}>
            {[1, 2, 3].map((n) => (
              <div key={n} className="rounded-control bg-sunken px-4 py-3 text-caption text-muted-foreground">Item {n}</div>
            ))}
          </Stack>
        </Specimen>
        <Specimen label="Cluster" note="wraps instead of overflowing">
          <Cluster gap={3}>
            {["Protected", "Verifiable", "Collateral-backed", "Stellar Testnet", "Sandbox anchor"].map((t) => (
              <span key={t} className={cn("rounded-full border border-border-strong bg-card px-3.5 py-1.5 text-caption font-medium")}>{t}</span>
            ))}
          </Cluster>
        </Specimen>
      </div>

      <Specimen label="Sticky action bar" note="fixed to the bottom on phones with safe-area padding and restrained glass; inline from md up">
        <div className="mx-auto w-full max-w-[24rem] overflow-hidden rounded-frame border border-border-strong bg-background">
          <div className="grid gap-3 p-5">
            <div className="h-3 w-2/3 rounded-full bg-sunken" />
            <div className="h-3 w-full rounded-full bg-sunken" />
            <div className="h-3 w-5/6 rounded-full bg-sunken" />
          </div>
          <div className="border-t border-border bg-background/80 px-5 pb-4 pt-3 backdrop-blur-xl">
            <StickyActionBar inline>
              <Button className="w-full" size="lg">Start protected cash out</Button>
            </StickyActionBar>
          </div>
        </div>
        <p className="mt-4 text-caption text-subtle">Shown inside a frame; the real bar is <code>position: fixed</code> below md.</p>
      </Specimen>

      <Card tone="sunken" padding="sm">
        <p className="text-caption text-muted-foreground">Resize the window (or use a phone) — the type scale, gutters and grids above all respond.</p>
      </Card>
    </GallerySection>
  );
}
