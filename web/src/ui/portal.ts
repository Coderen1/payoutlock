import { createContext, useContext } from "react";

/** Radix renders menus and tooltips into a portal on <body> — outside [data-pl], where the design system's
 * base styles and fonts don't apply. PLRoot publishes itself here so portals can mount inside it instead. */
export const PortalContainerContext = createContext<HTMLElement | null>(null);

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainerContext) ?? undefined;
}
