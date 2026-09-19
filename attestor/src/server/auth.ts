// Lightweight wallet auth (Phase 5 hardening — user-mandated). NOT a
// production auth system: a short-lived challenge/response over SEP-53
// message signing, proving the caller controls the connected wallet's
// private key without that key ever leaving the wallet extension, and
// without our backend ever seeing it.
//
// SEP-53 ("Stellar Signed Message") was chosen over a hand-rolled scheme
// because it is a real, already-supported primitive on both ends: Freighter
// exposes `signMessage()` (confirmed against the actual installed
// @stellar/freighter-api package — Phase 5 research), and the installed
// @stellar/stellar-sdk exposes a matching `Keypair.verifyMessage()` that
// implements the exact same hash (`SHA-256("Stellar Signed Message:\n" +
// message)`) — no custom crypto, no format guessing.
import type { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";
import { serverConfig } from "./config.ts";
import { createChallenge, consumeChallenge, createSession, getSession, type Session } from "./store.ts";

export function challengeMessage(nonce: string, issuedAt: number, expiresAt: number): string {
  return `PayoutLock demo auth\nnonce: ${nonce}\nissued_at: ${issuedAt}\nexpires_at: ${expiresAt}`;
}

export function issueChallenge() {
  const c = createChallenge(serverConfig.challengeTtlSeconds);
  return { nonce: c.nonce, message: challengeMessage(c.nonce, c.issuedAt, c.expiresAt), expiresAt: c.expiresAt };
}

export interface VerifyParams {
  nonce: string;
  publicKey: string;
  signature: string; // base64
}

export function verifyChallengeAndCreateSession(params: VerifyParams): { token: string; expiresAt: number } | { error: string } {
  const c = consumeChallenge(params.nonce);
  if (!c) return { error: "challenge_not_found_or_expired" };

  const message = challengeMessage(c.nonce, c.issuedAt, c.expiresAt);
  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(params.signature, "base64");
  } catch {
    return { error: "invalid_signature_encoding" };
  }

  let ok: boolean;
  try {
    ok = Keypair.fromPublicKey(params.publicKey).verifyMessage(message, signatureBytes);
  } catch {
    return { error: "invalid_public_key_or_signature" };
  }
  if (!ok) return { error: "signature_verification_failed" };

  const token = createSession(params.publicKey, serverConfig.sessionTtlSeconds);
  return { token, expiresAt: Math.floor(Date.now() / 1000) + serverConfig.sessionTtlSeconds };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
    }
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) {
    res.status(401).json({ error: "missing_session_token" });
    return;
  }
  const session = getSession(token);
  if (!session) {
    res.status(401).json({ error: "invalid_or_expired_session" });
    return;
  }
  req.session = session;
  next();
}
