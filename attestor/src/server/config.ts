// Server-only configuration for the orchestration API (Phase 5). Layered on
// top of ../config.ts (which already holds every secret this API needs —
// GUARANTEE_PROVIDER_SECRET, ATTESTOR_SECRET, RELAYER_SECRET, and, only when
// DEMO_MODE=true, DEMO_OFFRAMP_SECRET/DEMO_REFUND_SECRET). None of these
// values are ever sent to a client; this file only adds abuse-protection
// knobs for the HTTP layer itself.
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
};
