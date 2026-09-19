import { useLayoutEffect } from "react";

const CLASS = "dev-console-body";

/** Turns the legacy console stylesheet (developer.css) on for as long as the
 * /developer route is mounted. That stylesheet is the original global one, with
 * bare `body` / `button` / `header` selectors — every rule is prefixed with
 * `body.dev-console-body`, so it applies document-wide exactly as it did before
 * (including to the wallet modal the Kit appends to <body>) but can never leak
 * into the redesigned routes. A layout effect so the class is on before first paint. */
export function useLegacyConsoleBody(): void {
  useLayoutEffect(() => {
    document.body.classList.add(CLASS);
    return () => document.body.classList.remove(CLASS);
  }, []);
}
