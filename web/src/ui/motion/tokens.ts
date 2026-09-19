/** Motion vocabulary. Motion explains cause and effect; it never decorates. Durations are seconds. */
export const ease = [0.22, 1, 0.36, 1] as const; // the same curve as --ease-out-expo
export const spring = { type: "spring", stiffness: 380, damping: 32 } as const; // interactive: buttons, toggles
export const springSoft = { type: "spring", stiffness: 220, damping: 28 } as const; // layout, shared elements
export const duration = { fast: 0.15, base: 0.25, slow: 0.5, chapter: 0.7 } as const;
