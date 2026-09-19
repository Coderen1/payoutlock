import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's stock utilities. Without this, a custom
// type-scale class such as `text-display-m` would be mistaken for a text COLOR
// and silently dropped when merged with `text-ink-900`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display-xl", "display-l", "display-m", "title", "lead", "body", "caption", "mono"] }],
      shadow: [{ shadow: ["xs", "card", "float", "glow-seal"] }],
      rounded: [{ rounded: ["control", "card", "frame"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
