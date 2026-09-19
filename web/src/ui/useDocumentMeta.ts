import { useEffect } from "react";

/** Sets the tab title (and optionally `robots: noindex`) for as long as the
 * calling route is mounted, then restores what was there. */
export function useDocumentMeta({ title, noindex = false }: { title: string; noindex?: boolean }): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    let robots: HTMLMetaElement | null = null;
    if (noindex) {
      robots = document.createElement("meta");
      robots.name = "robots";
      robots.content = "noindex";
      document.head.appendChild(robots);
    }
    return () => {
      document.title = previousTitle;
      robots?.remove();
    };
  }, [title, noindex]);
}
