import { Link } from "react-router";
import { Button } from "../../../ui/Button";
import { Container } from "../../../ui/Container";
import { TestnetPill } from "../../../ui/TestnetPill";
import { CTA, NAV } from "../copy";

/** Wordmark, the sections, and the two ways in. Launch Demo is the primary action; Open App sits beside it. */
export function Nav() {
  return (
    <header className="relative z-20">
      <Container className="flex h-[4.5rem] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-title text-foreground" aria-label="PayoutLock home">
            PayoutLock
          </Link>
          <TestnetPill className="hidden xs:inline-flex" />
        </div>
        <nav aria-label="Sections" className="hidden items-center gap-8 lg:flex">
          {NAV.links.map((link) => (
            <a key={link.href} href={link.href} className="text-caption font-medium text-muted-foreground transition-colors hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/app">{CTA.app}</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/app/demo">{CTA.demo}</Link>
          </Button>
        </div>
      </Container>
    </header>
  );
}
