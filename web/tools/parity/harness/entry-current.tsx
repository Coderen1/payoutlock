// Current flavour: everything a redesigned page loads (design-system CSS) plus the scoped legacy
// stylesheet and the hook that switches it on — so bleed between the two would show up.
import { createRoot } from "react-dom/client";
import "../../../src/styles/globals.css";
import "../../../src/developer/developer.css";
import { useLegacyConsoleBody } from "../../../src/developer/useLegacyConsoleBody";
import { Scene } from "./scenes";
function Root() {
  useLegacyConsoleBody();
  return <Scene />;
}
createRoot(document.getElementById("root")!).render(<Root />);
