import type { ReactNode } from "react";
import { cn } from "../ui/cn";

export function GallerySection({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} data-gallery-section={id} className="min-w-0 scroll-mt-28">
      <div className="mb-8 max-w-[62ch]">
        <h2 className="text-display-m text-foreground">{title}</h2>
        {description && <p className="mt-3 text-lead text-muted-foreground">{description}</p>}
      </div>
      <div className="grid grid-cols-1 gap-10">{children}</div>
    </section>
  );
}

/** One labelled example on a soft panel. `night` renders it inside a dark chapter, where the semantic tokens flip. */
export function Specimen({ label, note, night, className, children }: { label: string; note?: ReactNode; night?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 content-start gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-caption font-semibold uppercase tracking-[0.08em] text-subtle">{label}</h3>
        {note && <p className="text-caption text-subtle">{note}</p>}
      </div>
      <div data-tone={night ? "night" : undefined} className={cn("min-w-0 rounded-frame border p-5 sm:p-8", night ? "border-night-line bg-night-950 text-night-fg" : "border-border bg-card/60", className)}>
        {children}
      </div>
    </div>
  );
}
