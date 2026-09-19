// In-memory state for the orchestration API. This is a demo backend, not
// production infrastructure — a single Node process is the whole deployment,
// so a plain Map is sufficient and avoids adding a database dependency for
// what is fundamentally short-lived, low-volume state (auth challenges,
// sessions, idempotency records, per-wallet active-protection tracking).
// Everything here is either short-TTL or bounded by the abuse-protection
// caps themselves.
import { randomBytes } from "node:crypto";

export interface Challenge {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export interface Session {
  publicKey: string;
  expiresAt: number;
}

export interface IdempotencyRecord {
  status: "pending" | "done" | "error";
  result?: unknown;
  error?: string;
  createdAt: number;
}

const challenges = new Map<string, Challenge>();
const sessions = new Map<string, Session>();
const idempotency = new Map<string, IdempotencyRecord>();
// wallet publicKey -> set of anchorWithdrawalId hex strings this API has
// opened on that wallet's behalf and not yet observed in a terminal state.
const walletActiveProtections = new Map<string, Set<string>>();

export interface ProtectionMeta {
  kind: "live" | "demo-failure" | "demo-refund";
  userAddress: string;
  destinationAddress: string; // anchor account_id (live) or Demo Off-Ramp Account (demo)
  expectedMemo: string;
  collateralAmountStroops: bigint;
  fundedAttestationSubmitted: boolean;
}

// anchorWithdrawalId (hex) -> metadata needed to independently verify
// funding later (Horizon-only, never re-derived from a stored JWT — see
// Phase 5 report on why anchor JWTs are never persisted).
const protectionMeta = new Map<string, ProtectionMeta>();

export function setProtectionMeta(idHex: string, meta: ProtectionMeta): void {
  protectionMeta.set(idHex, meta);
}

export function getProtectionMeta(idHex: string): ProtectionMeta | undefined {
  return protectionMeta.get(idHex);
}

export function allProtectionMetaEntries(): [string, ProtectionMeta][] {
  return [...protectionMeta.entries()];
}

export function createChallenge(ttlSeconds: number): Challenge {
  const nonce = randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  const challenge: Challenge = { nonce, issuedAt: now, expiresAt: now + ttlSeconds };
  challenges.set(nonce, challenge);
  return challenge;
}

export function consumeChallenge(nonce: string): Challenge | null {
  const c = challenges.get(nonce);
  if (!c) return null;
  challenges.delete(nonce); // single-use regardless of outcome
  if (Math.floor(Date.now() / 1000) > c.expiresAt) return null;
  return c;
}

export function createSession(publicKey: string, ttlSeconds: number): string {
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { publicKey, expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds });
  return token;
}

export function getSession(token: string): Session | null {
  const s = sessions.get(token);
  if (!s) return null;
  if (Math.floor(Date.now() / 1000) > s.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return s;
}

export function getIdempotent(key: string): IdempotencyRecord | undefined {
  return idempotency.get(key);
}

export function setIdempotent(key: string, record: IdempotencyRecord): void {
  idempotency.set(key, record);
}

export function deleteIdempotent(key: string): void {
  idempotency.delete(key);
}

export function activeProtectionCount(publicKey: string): number {
  return walletActiveProtections.get(publicKey)?.size ?? 0;
}

export function trackProtection(publicKey: string, anchorWithdrawalIdHex: string): void {
  const set = walletActiveProtections.get(publicKey) ?? new Set<string>();
  set.add(anchorWithdrawalIdHex);
  walletActiveProtections.set(publicKey, set);
}

export function untrackProtection(publicKey: string, anchorWithdrawalIdHex: string): void {
  walletActiveProtections.get(publicKey)?.delete(anchorWithdrawalIdHex);
}

// Periodic sweep of expired challenges/sessions/idempotency records so this
// never grows unbounded across a long-running demo process.
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [k, v] of challenges) if (now > v.expiresAt) challenges.delete(k);
  for (const [k, v] of sessions) if (now > v.expiresAt) sessions.delete(k);
  const idempotencyMaxAgeMs = 30 * 60_000;
  for (const [k, v] of idempotency) if (Date.now() - v.createdAt > idempotencyMaxAgeMs) idempotency.delete(k);
}, 60_000).unref();
