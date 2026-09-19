import { BadgeCheck, CircleCheck, CircleDashed, Clock, ArrowUpRight, ShieldCheck, TimerOff, Undo2, type LucideIcon } from "lucide-react";
import type { Tone } from "./tones";

/** The vocabulary a person sees while a cash out runs. Contract state names never appear in the product UI;
 * mapping chain state to these keys is the product flow's job, not the design system's. */
export type LifecycleStatus =
  | "preparing"
  | "ready"
  | "verifying"
  | "funded"
  | "active"
  | "processing"
  | "delayed"
  | "available"
  | "settled"
  | "claimed"
  | "returned"
  | "expired";

export interface LifecycleMeta {
  label: string;
  description: string;
  tone: Tone;
  icon: LucideIcon;
  /** Work is in progress: show a spinner instead of the icon. */
  busy?: boolean;
  /** A final outcome — the cash out is finished. */
  outcome?: boolean;
}

export const LIFECYCLE: Record<LifecycleStatus, LifecycleMeta> = {
  preparing: { label: "Preparing", description: "Getting your protected cash out ready.", tone: "neutral", icon: CircleDashed, busy: true },
  ready: { label: "Ready to send", description: "Send your USDC to start the protected payout.", tone: "sapphire", icon: ArrowUpRight },
  verifying: { label: "Verifying funding", description: "Payment sent. Confirming it on Stellar.", tone: "sapphire", icon: CircleDashed, busy: true },
  funded: { label: "Funding verified", description: "Your payment is verified on Stellar.", tone: "emerald", icon: CircleCheck },
  active: { label: "Protection active", description: "Your USDC is covered while the bank payout is processed.", tone: "seal", icon: ShieldCheck },
  processing: { label: "Fiat payout processing", description: "Your bank payout is being processed.", tone: "sapphire", icon: CircleDashed, busy: true },
  delayed: { label: "Payout delayed", description: "Taking longer than expected. Your protection unlocks soon.", tone: "amber", icon: Clock },
  available: { label: "Protection available", description: "Your protection is ready to claim.", tone: "seal", icon: ShieldCheck },
  settled: { label: "Settled", description: "Your bank payout completed.", tone: "emerald", icon: CircleCheck, outcome: true },
  claimed: { label: "Claimed", description: "Your protection paid out to your wallet.", tone: "seal", icon: BadgeCheck, outcome: true },
  returned: { label: "Principal returned", description: "Your USDC was returned to your wallet.", tone: "sapphire", icon: Undo2, outcome: true },
  expired: { label: "Expired", description: "The sending window closed. No funds moved.", tone: "neutral", icon: TimerOff, outcome: true },
};

export const LIFECYCLE_ORDER = Object.keys(LIFECYCLE) as LifecycleStatus[];
