import type { FlowMode } from "./scenario.ts";

/** The only thing this app keeps in the browser: where the person was. Never a token, a JWT, an amount, a
 * deadline or a state — all of that is re-read from the chain (get_protection) after a refresh. */
export interface LastCashOut {
  flow: FlowMode;
  reference: string;
}

const KEY = "payoutlock:last-cash-out";

export function loadLastCashOut(storage: Pick<Storage, "getItem"> | null = safeStorage()): LastCashOut | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<LastCashOut>;
    if ((v.flow === "live" || v.flow === "demo") && typeof v.reference === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v.reference)) {
      return { flow: v.flow, reference: v.reference };
    }
  } catch {
    /* unreadable or blocked: treat as nothing remembered */
  }
  return null;
}

export function saveLastCashOut(value: LastCashOut, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    // Written field by field so nothing else can ever end up here.
    storage?.setItem(KEY, JSON.stringify({ flow: value.flow, reference: value.reference }));
  } catch {
    /* private mode / blocked storage: the app still works, it just won't offer to resume */
  }
}

export function clearLastCashOut(storage: Pick<Storage, "removeItem"> | null = safeStorage()): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // accessing localStorage can throw when site data is blocked
  }
}

export const LAST_CASH_OUT_KEY = KEY;
