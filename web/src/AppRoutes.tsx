import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";

// Every route is its own chunk. The Stellar SDK and Wallets Kit (~1 MB) are only
// pulled in by /developer (and, later, /app) — never by the marketing site.
const MarketingRoute = lazy(() => import("./routes/MarketingRoute"));
const CashOutRoute = lazy(() => import("./routes/CashOutRoute"));
const DemoRoute = lazy(() => import("./routes/DemoRoute"));
const DeveloperConsole = lazy(() => import("./developer/DeveloperConsole"));
const NotFoundRoute = lazy(() => import("./routes/NotFoundRoute"));
// The component gallery exists only in development: `import.meta.env.DEV` is a build-time constant, so the
// dynamic import (and everything it pulls in) is removed from the production bundle.
const Gallery = import.meta.env.DEV ? lazy(() => import("./gallery/Gallery")) : null;

/** Sitemap:  /  ·  /app  ·  /app/cash-out/:reference  ·  /app/demo  ·
 * /app/demo/:reference  ·  /developer  ·  /_kit (dev only)  ·  everything else -> 404. */
export default function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<MarketingRoute />} />
        {/* One element per section, with the reference as a child route: moving from compose to tracking must not
            remount the flow, or what the browser holds in memory (the anchor sign-in, receipts) would be lost. */}
        <Route path="/app" element={<CashOutRoute />}>
          <Route index element={null} />
          <Route path="cash-out/:reference" element={null} />
        </Route>
        <Route path="/app/demo" element={<DemoRoute />}>
          <Route index element={null} />
          <Route path=":reference" element={null} />
        </Route>
        <Route path="/developer/*" element={<DeveloperConsole />} />
        {Gallery && <Route path="/_kit" element={<Gallery />} />}
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </Suspense>
  );
}
