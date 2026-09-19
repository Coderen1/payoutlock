import { PLRoot } from "../../ui/PLRoot";
import { useDocumentMeta } from "../../ui/useDocumentMeta";
import { NAV } from "./copy";
import { Business } from "./sections/Business";
import { FinalCta, Footer } from "./sections/Closing";
import { Developers } from "./sections/Developers";
import { GapSection } from "./sections/GapSection";
import { Hero } from "./sections/Hero";
import { Nav } from "./sections/Nav";
import { ProductSection } from "./sections/ProductSection";
import { Verifiable } from "./sections/Verifiable";

/** `/` — the public site. Story first (what it is, the gap, how it is covered), then who it is for, then proof and the
 * technical sections. It never touches the wallet, the API or the Stellar SDK: everything here is static. All of its
 * motion is CSS (landing.css), driven by at most one scroll listener per scene, so it needs no animation library. */
export default function Landing() {
  useDocumentMeta({ title: "Cash out with confidence. · PayoutLock" });
  return (
    <PLRoot>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-caption focus:font-medium focus:text-primary-foreground"
      >
        {NAV.skip}
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <GapSection />
        <ProductSection />
        <Business />
        <Verifiable />
        <Developers />
        <FinalCta />
      </main>
      <Footer />
    </PLRoot>
  );
}
