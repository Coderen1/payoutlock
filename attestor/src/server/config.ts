// Server-only configuration for the orchestration API (Phase 5). Layered on
// top of ../config.ts (which already holds every secret this API needs —
// GUARANTEE_PROVIDER_SECRET, ATTESTOR_SECRET, RELAYER_SECRET, and, only when
// DEMO_MODE=true, DEMO_OFFRAMP_SECRET/DEMO_REFUND_SECRET). None of these
// values are ever sent to a client; this file only adds abuse-protection
// knobs for the HTTP layer itself.
/** A non-numeric or non-positive value falls back to the default rather than
 * becoming NaN/0 (which would turn a setInterval into a hot loop). */
function positiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n > 0 ? n : fallback;
}

export const serverConfig = {
  port: Number(process.env.PORT ?? 8787),
  // Comma-separated list of allowed browser origins for our OWN API (not the
  // anchor's CORS, which is separately confirmed open — this is ours).
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173").split(",").map((s) => s.trim()),

  challengeTtlSeconds: Number(process.env.AUTH_CHALLENGE_TTL_SECONDS ?? 120),
  sessionTtlSeconds: Number(process.env.AUTH_SESSION_TTL_SECONDS ?? 900), // 15 min

  // Minimum abuse protection (user-mandated, Phase 5 hardening) — these caps
  // are deliberately low/demo-scale, not production sizing.
  maxProtectedAmountStroops: BigInt(process.env.MAX_PROTECTED_AMOUNT_STROOPS ?? "20000000"), // 2 USDC
  maxActiveProtectionsPerWallet: Number(process.env.MAX_ACTIVE_PROTECTIONS_PER_WALLET ?? 2),
  minDurationSeconds: 15,
  maxDurationSeconds: 30 * 24 * 60 * 60, // 30 days

  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMaxPerWindow: Number(process.env.RATE_LIMIT_MAX_PER_WINDOW ?? 20),

  demoMode: process.env.DEMO_MODE === "true",

  // Thin keeper (keeper.ts): permissionless advance_to_grace /
  // advance_to_claimable / expire_unfunded plus terminal-state slot release,
  // submitted by the existing relayer. On by default; KEEPER_ENABLED=false
  // leaves only the /developer manual controls.
  keeperEnabled: process.env.KEEPER_ENABLED !== "false",
  keeperIntervalMs: positiveNumber(process.env.KEEPER_INTERVAL_SECONDS, 10) * 1000,
  // Extra seconds past funding_deadline before an unfunded protection may be
  // expired — covers Horizon indexing lag and the funding sweep's own interval
  // so an on-time payment is never expired out from under its FUNDED attestation.
  keeperExpireBufferSeconds: positiveNumber(process.env.KEEPER_EXPIRE_BUFFER_SECONDS, 30),
};
