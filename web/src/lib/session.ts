// In-memory-only session state. Deliberately NOT persisted to localStorage,
// sessionStorage, cookies, or the URL — per explicit instruction, the app's
// own session token and any anchor SEP-10 JWT must never survive outside JS
// memory. A page refresh means reconnecting; that's an accepted MVP
// trade-off, not an oversight.
import { useSyncExternalStore } from "react";

interface SessionState {
  address: string | null;
  appSessionToken: string | null; // our own backend's session (SEP-53 auth)
  appSessionExpiresAt: number | null;
}

let state: SessionState = { address: null, appSessionToken: null, appSessionExpiresAt: null };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setWalletAddress(address: string | null): void {
  state = { ...state, address };
  emit();
}

export function setAppSession(token: string | null, expiresAt: number | null): void {
  state = { ...state, appSessionToken: token, appSessionExpiresAt: expiresAt };
  emit();
}

export function clearSession(): void {
  state = { address: null, appSessionToken: null, appSessionExpiresAt: null };
  emit();
}

export function getSessionSnapshot(): SessionState {
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSessionSnapshot,
  );
}
