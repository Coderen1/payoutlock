import { ArrowRight } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../../../ui/Button";
import { Container } from "../../../ui/Container";
import { Section } from "../../../ui/Section";
import { Reveal } from "../Reveal";
import { CTA, FINAL, FOOTER } from "../copy";

/** The last call to action. */
export function FinalCta() {
  return (
    <Section spacing="chapter" data-section="final" aria-labelledby="final-title">
      <Container className="text-center">
        <Reveal>
          <h2 id="final-title" className="mx-auto max-w-[18ch] text-display-l text-foreground">
            {FINAL.title}
          </h2>
          <p className="mx-auto mt-6 max-w-[30rem] text-lead text-muted-foreground">{FINAL.body}</p>
          <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
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
          <p className="mt-6">
            <Link to="/developer" className="text-caption font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {CTA.developer}
            </Link>
          </p>
        </Reveal>
      </Container>
    </Section>
  );
}

/** The footer says what this is. */
export function Footer() {
  return (
    <footer data-section="footer" className="border-t border-border py-10">
      <Container className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[28rem]">
          <p className="text-title text-foreground">PayoutLock</p>
          <p className="mt-3 text-caption text-muted-foreground">{FOOTER.disclaimer}</p>
        </div>
        <nav aria-label="Product" className="flex flex-wrap gap-x-7 gap-y-3 text-caption font-medium text-muted-foreground">
          <Link to="/app/demo" className="transition-colors hover:text-foreground">
            {CTA.demo}
          </Link>
          <Link to="/app" className="transition-colors hover:text-foreground">
            {CTA.app}
          </Link>
          <Link to="/developer" className="transition-colors hover:text-foreground">
            {CTA.developer}
          </Link>
        </nav>
      </Container>
    </footer>
  );
}
