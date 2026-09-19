import { useSyncExternalStore } from "react";
import "./gallery.css";
import { PLRoot } from "../ui/PLRoot";
import { TestnetPill } from "../ui/TestnetPill";
import { MotionProvider } from "../ui/motion/MotionProvider";
import { useDocumentMeta } from "../ui/useDocumentMeta";
import { SECTIONS } from "./sections";

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};

/** Dev-only component gallery at /_kit (not part of the production build). Every specimen is a real component. */
export default function Gallery() {
  useDocumentMeta({ title: "UI kit · PayoutLock", noindex: true });
  const width = useSyncExternalStore(subscribe, () => window.innerWidth, () => 0);
  return (
    <PLRoot>
      <MotionProvider>
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="mx-auto flex w-[min(100%_-_2.5rem,1240px)] items-center justify-between gap-4 py-3 lg:w-[min(100%_-_6rem,1240px)]">
            <div className="flex items-center gap-3">
              <p className="text-title text-foreground">PayoutLock UI kit</p>
              <span className="hidden rounded-full bg-muted px-2.5 py-1 text-caption font-medium text-muted-foreground sm:inline">dev only</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-mono text-subtle">{width}px</span>
              <TestnetPill />
            </div>
          </div>
          <nav aria-label="Sections" data-gallery-nav className="lg:hidden">
            <ul className="mx-auto flex w-[min(100%_-_2.5rem,1240px)] gap-2 overflow-x-auto pb-3">
              {SECTIONS.map((s) => (
                <li key={s.id} className="shrink-0">
                  <a href={`#${s.id}`} className="inline-flex h-9 items-center rounded-full border border-border-strong bg-card px-3.5 text-caption font-medium">{s.title}</a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div className="mx-auto flex w-[min(100%_-_2.5rem,1240px)] gap-12 py-10 lg:w-[min(100%_-_6rem,1240px)]">
          <nav aria-label="Sections" data-gallery-nav className="hidden w-52 shrink-0 lg:block">
            <ul className="sticky top-24 grid gap-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-control px-3 py-2 text-body text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground">{s.title}</a>
                </li>
              ))}
            </ul>
          </nav>
          <main className="grid min-w-0 flex-1 grid-cols-1 gap-24">
            {SECTIONS.map(({ id, Component }) => (
              <Component key={id} />
            ))}
          </main>
        </div>
      </MotionProvider>
    </PLRoot>
  );
}
