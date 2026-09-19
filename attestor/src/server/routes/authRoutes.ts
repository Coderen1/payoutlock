import { Router } from "express";
import { issueChallenge, verifyChallengeAndCreateSession } from "../auth.ts";
import { rateLimit } from "../rateLimit.ts";
import { isValidStellarAddress } from "../validation.ts";

export const authRoutes = Router();

authRoutes.get("/challenge", rateLimit, (_req, res) => {
  const { nonce, message, expiresAt } = issueChallenge();
  res.json({ nonce, message, expiresAt });
});

authRoutes.post("/verify", rateLimit, (req, res) => {
  const { nonce, publicKey, signature } = req.body ?? {};
  if (typeof nonce !== "string" || !isValidStellarAddress(publicKey) || typeof signature !== "string") {
    res.status(400).json({ error: "invalid_request" });
    return;
  }
  const result = verifyChallengeAndCreateSession({ nonce, publicKey, signature });
  if ("error" in result) {
    res.status(401).json(result);
    return;
  }
  res.json({ token: result.token, expiresAt: result.expiresAt, publicKey });
});
