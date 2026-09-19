import { Link } from "react-router";
import { PLRoot } from "../ui/PLRoot";
import { TestnetPill } from "../ui/TestnetPill";
import { useDocumentMeta } from "../ui/useDocumentMeta";

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
  /** Extra line, e.g. the protection reference being tracked. */
  detail?: string;
  links: { to: string; label: string }[];
}

/** Honest stand-in shown at the redesigned routes until each one is built.
 * It exists to prove routing, code-splitting, tokens and fonts end to end —
 * it is not a design. */
export function Placeholder({ eyebrow, title, description, detail, links }: PlaceholderProps) {
  useDocumentMeta({ title: `${title} · PayoutLock` });
  return (
    <PLRoot className="grid place-items-center px-5 py-16">
      <main className="w-full max-w-[560px]">
        <TestnetPill />
        <p className="mt-8 font-mono text-mono uppercase tracking-[0.08em] text-ink-500">{eyebrow}</p>
        <h1 className="mt-3 text-display-m text-ink-900">{title}</h1>
        <p className="mt-4 text-lead text-ink-600">{description}</p>
        {detail && <p className="mt-4 break-all font-mono text-mono text-ink-500">{detail}</p>}
        <nav aria-label="Other routes" className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-body font-medium">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="text-sapphire-600 underline-offset-4 hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </main>
    </PLRoot>
  );
}
