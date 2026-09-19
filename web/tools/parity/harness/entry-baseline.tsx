// Baseline flavour: the legacy global stylesheet, loaded exactly as the original app did.
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import { Scene } from "./scenes";
createRoot(document.getElementById("root")!).render(<Scene />);
