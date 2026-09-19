// The settlement-gap panel's short pinned moment, as data: where on the scroll (0 to 1) each part of the story plays.
// Kept apart from the component so its order — the line before the band that covers it, the claim path last — is tested.
import { ramp } from "./scroll.ts";

export type Range = readonly [number, number];

export const T = {
  /** USDC settles on Stellar: the solid segment draws. */
  chain: [0.02, 0.16],
  /** The payout is unresolved: the gap draws. */
  gap: [0.14, 0.44],
  /** Protection stays in place: the band draws under the gap. */
  band: [0.44, 0.68],
  /** Each phase caption comes up to full strength as its part of the line draws — and stays. */
  phases: [
    [0.0, 0.06],
    [0.2, 0.28],
    [0.46, 0.54],
  ],
  /** Then the one path that ends in a claim. */
  failure: [0.7, 0.9],
} as const satisfies { chain: Range; gap: Range; band: Range; phases: readonly Range[]; failure: Range };

/** Captions and the claim path are dimmed, never hidden, before their moment: readable at every scroll position. */
export const RESTING_OPACITY = 0.4;

/** Dimmed before its moment, full once reached — never hidden. A CSS expression of the scene's `--p`. */
export const reached = (range: Range): string => `calc(${RESTING_OPACITY} + ${1 - RESTING_OPACITY} * ${ramp(...range)})`;
