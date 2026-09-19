import { ArrowDown, ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../../../ui/Button";
import { Container } from "../../../ui/Container";
import { HeroVisual } from "../HeroVisual";
import { CTA, HERO } from "../copy";

/** Product first: what it is and the two ways in on the left, the product itself on the right (below, on phones).
 * Its height is its content's — the next section starts on the first screen. */
export function Hero() {
  return (
    <section data-section="hero" aria-labelledby="hero-title" className="relative overflow-x-clip">
      <Container className="grid items-center gap-10 pb-16 pt-8 sm:pb-20 sm:pt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12 lg:pb-20 lg:pt-10 xl:gap-20">
        <div data-hero-text className="pl-rise">
          <p className="font-mono text-mono uppercase tracking-[0.08em] text-subtle">{HERO.eyebrow}</p>
          <h1 id="hero-title" className="mt-5 text-display-xl text-foreground lg:text-display-l">
            {HERO.title}
          </h1>
          <p className="mt-5 max-w-[30rem] text-lead text-muted-foreground">{HERO.lead}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/app/demo">
                {CTA.demo}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link to="/app">{CTA.app}</Link>
            </Button>
          </div>
          <p className="mt-5 text-caption text-subtle">
            {HERO.note}{" "}
            <Link to="/developer" className="font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {CTA.developer}
            </Link>
          </p>
          <Audience className="mt-10 hidden lg:flex" />
        </div>
        <HeroVisual />
        {/* on phones the audience line follows the product, so the product comes up sooner */}
        <Audience className="-mt-4 flex lg:hidden" />
      </Container>
    </section>
  );
}

function Audience({ className }: { className: string }) {
  return (
    <a
      href="#businesses"
      className={`${className} max-w-[30rem] items-center justify-between gap-4 border-t border-border pt-5 text-caption font-medium text-muted-foreground transition-colors hover:text-foreground`}
    >
      {HERO.audience}
      <ArrowDown aria-hidden className="size-3.5 shrink-0" />
    </a>
  );
}
