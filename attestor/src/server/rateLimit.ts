// Basic fixed-window rate limiter. Not distributed, not production-grade —
// a single-process in-memory counter, which is all a demo backend needs
// (user-mandated minimum abuse protection, Phase 5).
import type { Request, Response, NextFunction } from "express";
import { serverConfig } from "./config.ts";

interface Window {
  count: number;
  windowStart: number;
}

const windows = new Map<string, Window>();

function keyFor(req: Request): string {
  // Prefer the authenticated wallet once known (set by requireSession
  // upstream); fall back to IP for unauthenticated routes like /api/auth/*.
  const publicKey = (req as any).session?.publicKey;
  return publicKey ? `wallet:${publicKey}` : `ip:${req.ip}`;
}

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = keyFor(req);
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now - w.windowStart > serverConfig.rateLimitWindowMs) {
    windows.set(key, { count: 1, windowStart: now });
    next();
    return;
  }
  if (w.count >= serverConfig.rateLimitMaxPerWindow) {
    res.status(429).json({ error: "rate_limited", retryAfterMs: serverConfig.rateLimitWindowMs - (now - w.windowStart) });
    return;
  }
  w.count += 1;
  next();
}

setInterval(() => {
  const cutoff = Date.now() - serverConfig.rateLimitWindowMs * 5;
  for (const [k, w] of windows) if (w.windowStart < cutoff) windows.delete(k);
}, 5 * 60_000).unref();
