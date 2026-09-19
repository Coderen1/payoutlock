import type { ReactNode } from "react";
import { Wallet } from "lucide-react";

/** "Look at your wallet": shown while a wallet approval is pending, so the person knows what is being asked and
 * that they are not stuck. */
export function WalletPrompt({ title = "Check your wallet", children }: { title?: string; children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3.5 rounded-card border border-sapphire-600/20 bg-sapphire-50 p-4">
      <span className="relative mt-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-card text-sapphire-700">
        <span aria-hidden className="absolute inset-0 rounded-full bg-sapphire-600/25 motion-safe:animate-ping" />
        <Wallet aria-hidden className="relative size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-sapphire-700">{title}</p>
        <p className="text-body text-foreground">{children}</p>
      </div>
    </div>
  );
}
