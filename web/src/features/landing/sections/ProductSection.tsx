import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Badge } from "../../../ui/Badge";
import { Container } from "../../../ui/Container";
import { cn } from "../../../ui/cn";
import { LIFECYCLE } from "../../../ui/lifecycle";
import { useMediaQuery } from "../../../ui/useMediaQuery";
import { ProductStage } from "../ProductStage";
import { Reveal } from "../Reveal";
import { PRODUCT, type StageId } from "../copy";
import { useInView, useScrollProgress } from "../scroll";

/** "all": walks every stage of every path while on screen. "path": plays the chosen path once, then holds. "off": a
 * stage was chosen by hand. Reduced motion never plays. */
type Autoplay = "all" | "path" | "off";
const STAGE_MS = 3000;
const HOLD_MS = 4200;

/** The product experience and its outcomes, on one surface. Three ways a cash out can go are the tabs; each plays its
 * stages on the same product surface (the hero's visual family), and any stage can be picked by hand. */
export function ProductSection() {
  const [pathIndex, setPathIndex] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [autoplay, setAutoplay] = useState<Autoplay>("all");
  const sectionRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef);
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  useScrollProgress(sectionRef, { enabled: !reduce, mode: "viewport" });

  const path = PRODUCT.paths[pathIndex];
  const stageId = path.stages[stageIndex] as StageId;
  const last = stageIndex === path.stages.length - 1;

  useEffect(() => {
    if (autoplay === "off" || !inView || reduce) return;
    if (last && autoplay === "path") return;
    const timer = window.setTimeout(
      () => {
        if (!last) setStageIndex((i) => i + 1);
        else {
          setPathIndex((p) => (p + 1) % PRODUCT.paths.length);
          setStageIndex(0);
        }
      },
      last ? HOLD_MS : STAGE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [autoplay, inView, reduce, last, stageIndex, pathIndex]);

  const choosePath = (i: number) => {
    setPathIndex(i);
    setStageIndex(0);
    setAutoplay("path");
  };
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (pathIndex + step + PRODUCT.paths.length) % PRODUCT.paths.length;
    choosePath(next);
    (e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
  };

  return (
    <section ref={sectionRef} data-section="product" aria-labelledby="product-title" className="py-[clamp(4.5rem,9vw,8rem)]">
      <Container className="grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 xl:gap-20">
        <div>
          <Reveal>
            <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{PRODUCT.eyebrow}</p>
            <h2 id="product-title" className="mt-4 text-display-m text-foreground">
              {PRODUCT.title}
            </h2>
            <p className="mt-5 max-w-[30rem] text-lead text-muted-foreground">{PRODUCT.body}</p>
          </Reveal>

          <div role="tablist" aria-label="Ways a cash out can go" aria-orientation="vertical" className="mt-8 grid max-w-[30rem] gap-2">
            {PRODUCT.paths.map((p, i) => {
              const selected = i === pathIndex;
              return (
                <button
                  key={p.id}
                  id={`path-tab-${p.id}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="product-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choosePath(i)}
                  onKeyDown={onTabKey}
                  className={cn(
                    "relative w-full overflow-hidden rounded-card border px-5 py-4 text-left transition-[background-color,border-color,box-shadow] duration-300",
                    selected ? "border-border bg-card shadow-card" : "border-transparent hover:bg-surface-hover",
                  )}
                >
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                    <span className={cn("text-body font-semibold", selected ? "text-foreground" : "text-muted-foreground")}>{p.tab}</span>
                    {"simulated" in p && (
                      <Badge tone="amber" size="sm">
                        {p.simulated}
                      </Badge>
                    )}
                  </span>
                  {selected && <span className="mt-1 block text-caption text-muted-foreground">{p.summary}</span>}
                  {selected && (
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
                      <span
                        className="block h-full origin-left bg-foreground transition-transform duration-500 ease-out-expo"
                        style={{ transform: `scaleX(${(stageIndex + 1) / p.stages.length})` }}
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-6 hidden max-w-[30rem] text-caption text-subtle lg:block">{PRODUCT.note}</p>
        </div>

        <div ref={stageRef} id="product-panel" role="tabpanel" aria-labelledby={`path-tab-${path.id}`}>
          <ProductStage stageId={stageId} simulated={"simulated" in path} />
          <div role="group" aria-label={PRODUCT.stepperLabel} className="mt-6 flex flex-wrap items-center justify-center gap-1.5 lg:justify-end lg:pr-8">
            {path.stages.map((id, i) => (
              <button
                key={id}
                type="button"
                aria-current={i === stageIndex ? "step" : undefined}
                onClick={() => {
                  setStageIndex(i);
                  setAutoplay("off");
                }}
                className={cn(
                  "h-9 rounded-full border px-3 text-caption font-medium transition-colors sm:px-3.5",
                  i === stageIndex ? "border-foreground bg-foreground text-primary-foreground" : "border-border-strong text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                )}
              >
                <span className={cn("mr-1.5 font-mono text-[0.6875rem]", i === stageIndex ? "text-primary-foreground/70" : "text-subtle")}>{i + 1}</span>
                {LIFECYCLE[PRODUCT.stages[id as StageId].status].label}
              </button>
            ))}
          </div>
          <p className="mt-5 text-center text-caption text-subtle lg:hidden">{PRODUCT.note}</p>
        </div>
      </Container>
    </section>
  );
}
