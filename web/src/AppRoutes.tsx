import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router";

// Every route is its own chunk. The Stellar SDK and Wallets Kit (~1 MB) are only
// pulled in by /developer (and, later, /app) — never by the marketing site.
const MarketingRoute = lazy(() => import("./routes/MarketingRoute"));
const CashOutRoute = lazy(() => import("./routes/CashOutRoute"));
const DemoRoute = lazy(() => import("./routes/DemoRoute"));
const DeveloperConsole = lazy(() => import("./developer/DeveloperConsole"));
const NotFoundRoute = lazy(() => import("./routes/NotFoundRoute"));

/** Sitemap:  /  ·  /app  ·  /app/cash-out/:reference  ·  /app/demo  ·
 * /app/demo/:reference  ·  /developer  ·  everything else -> 404. */
export default function AppRoutes() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/" element={<MarketingRoute />} />
        <Route path="/app" element={<CashOutRoute />} />
        <Route path="/app/cash-out/:reference" element={<CashOutRoute />} />
        <Route path="/app/demo" element={<DemoRoute />} />
        <Route path="/app/demo/:reference" element={<DemoRoute />} />
        <Route path="/developer/*" element={<DeveloperConsole />} />
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </Suspense>
  );
}
