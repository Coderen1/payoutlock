// Minimal CORS middleware for OUR OWN API (separate concern from the real
// anchor's CORS, which was empirically confirmed open in Phase 5 — see
// report). Only the configured frontend origin(s) are allowed.
import type { Request, Response, NextFunction } from "express";
import { serverConfig } from "./config.ts";

export function cors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (origin && serverConfig.allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
