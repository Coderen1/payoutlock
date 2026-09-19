import type { ComponentType } from "react";
import { ControlsSection } from "./sections/ControlsSection";
import { LayoutSection } from "./sections/LayoutSection";
import { MotionSection } from "./sections/MotionSection";
import { ProofSection } from "./sections/ProofSection";
import { StatesSection } from "./sections/StatesSection";
import { SurfacesSection } from "./sections/SurfacesSection";
import { TimelineSection } from "./sections/TimelineSection";
import { TokensSection } from "./sections/TokensSection";
import { TypographySection } from "./sections/TypographySection";
import { WalletAmountSection } from "./sections/WalletAmountSection";

export const SECTIONS: { id: string; title: string; Component: ComponentType }[] = [
  { id: "tokens", title: "Tokens", Component: TokensSection },
  { id: "typography", title: "Typography", Component: TypographySection },
  { id: "controls", title: "Buttons & inputs", Component: ControlsSection },
  { id: "surfaces", title: "Cards, badges & notices", Component: SurfacesSection },
  { id: "wallet-amount", title: "Wallet chip & amounts", Component: WalletAmountSection },
  { id: "timeline", title: "Timeline", Component: TimelineSection },
  { id: "proof", title: "Proof & hashes", Component: ProofSection },
  { id: "states", title: "Loading, error & success", Component: StatesSection },
  { id: "layout", title: "Responsive primitives", Component: LayoutSection },
  { id: "motion", title: "Motion", Component: MotionSection },
];
