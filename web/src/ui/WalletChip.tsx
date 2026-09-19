import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, ExternalLink, LogOut, Wallet } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { AddressGlyph } from "./AddressGlyph";
import { Button } from "./Button";
import { cn } from "./cn";
import { usePortalContainer } from "./portal";
import { shortenMiddle } from "./text";

const itemClass = "flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] outline-none data-[highlighted]:bg-surface-hover";

interface WalletChipProps {
  /** null/undefined = not connected. */
  address?: string | null;
  connecting?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  explorerUrl?: string;
  className?: string;
}

/** Wallet state in the header: a Connect button, or the connected wallet as a chip with a small menu
 * (copy address, view on the explorer, disconnect). Presentation only — wallet logic lives elsewhere. */
export function WalletChip({ address, connecting, onConnect, onDisconnect, explorerUrl, className }: WalletChipProps) {
  const container = usePortalContainer();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!address) {
    return (
      <Button variant="secondary" status={connecting ? "loading" : "idle"} onClick={onConnect} leading={<Wallet aria-hidden className="size-4" />} className={className}>
        Connect wallet
      </Button>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      /* clipboard blocked: the label just stays "Copy address" */
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Wallet ${shortenMiddle(address, 4, 4)}, open menu`}
          className={cn(
            "group inline-flex h-11 items-center gap-2.5 rounded-full border border-border-strong bg-card pl-1.5 pr-3.5",
            "transition-colors duration-150 hover:bg-surface-hover data-[state=open]:bg-surface-hover",
            className,
          )}
        >
          <AddressGlyph address={address} size={32} />
          <span className="font-mono text-mono text-foreground">{shortenMiddle(address, 4, 4)}</span>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container}>
        <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-[min(20rem,calc(100vw-2rem))] rounded-card border border-border bg-popover p-1.5 text-popover-foreground shadow-float data-[state=open]:animate-pop-in">
          <div className="px-3 py-2">
            <p className="text-caption text-muted-foreground">Connected wallet</p>
            <p className="mt-0.5 break-all font-mono text-mono">{address}</p>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item
            className={itemClass}
            onSelect={(e) => {
              e.preventDefault(); // keep the menu open so the "Copied" confirmation is seen
              void copy();
            }}
          >
            {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
            {copied ? "Copied" : "Copy address"}
          </DropdownMenu.Item>
          {explorerUrl && (
            <DropdownMenu.Item asChild>
              <a href={explorerUrl} target="_blank" rel="noreferrer" className={itemClass}>
                <ExternalLink aria-hidden className="size-4" />
                View on Stellar Expert
              </a>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <DropdownMenu.Item className={itemClass} onSelect={onDisconnect}>
            <LogOut aria-hidden className="size-4" />
            Disconnect
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
