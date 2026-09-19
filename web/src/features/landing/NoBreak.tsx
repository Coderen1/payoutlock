import { Fragment } from "react";

const COMPOUNDS = /(on-chain|off-chain|off-ramp|cash-outs?)/;

/** Keeps hyphenated compounds whole: "off-" or "on-" left at the end of a line reads badly in large type. */
export function NoBreak({ text }: { text: string }) {
  return text.split(COMPOUNDS).map((part, i) =>
    COMPOUNDS.test(part) ? (
      <span key={i} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
