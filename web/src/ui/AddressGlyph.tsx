import { useMemo } from "react";
import { cn } from "./cn";

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const INKS = ["var(--color-ink-900)", "var(--color-sapphire-700)", "var(--color-ink-600)"];

/** A small mirrored 5×5 glyph derived from an address, so the same wallet always looks the same at a glance.
 * Monochrome on purpose: seal is reserved for protection. Decorative — the address text carries the meaning. */
export function AddressGlyph({ address, size = 32, className }: { address: string; size?: number; className?: string }) {
  const { cells, ink } = useMemo(() => {
    const bits = fnv1a(address);
    const cells: [number, number][] = [];
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if ((bits >> (row * 3 + col)) & 1) {
          cells.push([col, row]);
          if (col < 2) cells.push([4 - col, row]); // mirror
        }
      }
    }
    return { cells, ink: INKS[fnv1a(`${address}·ink`) % INKS.length] };
  }, [address]);

  return (
    <span aria-hidden style={{ width: size, height: size }} className={cn("inline-grid shrink-0 place-items-center rounded-full bg-muted", className)}>
      <svg viewBox="0 0 5 5" width={size * 0.5} height={size * 0.5} fill={ink}>
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" rx="0.18" />
        ))}
      </svg>
    </span>
  );
}
