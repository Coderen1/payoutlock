import express from "express";
import { cors } from "./cors.ts";
import { serverConfig } from "./config.ts";
import { authRoutes } from "./routes/authRoutes.ts";
import { liveRoutes } from "./routes/liveRoutes.ts";
import { commonRoutes } from "./routes/commonRoutes.ts";
import { demoRoutes } from "./routes/demoRoutes.ts";

export function buildApp() {
  const app = express();
  app.use(cors);
  app.use(express.json());

  app.use("/api/auth", authRoutes);
  app.use("/api/live", liveRoutes);
  app.use("/api", commonRoutes);

  // /api/demo/* is only ever mounted when DEMO_MODE=true — a production run
  // (DEMO_MODE unset) has no route registered for this prefix at all, not
  // just a runtime guard inside it. demoOffRampSimulator.ts additionally
  // guards every function it exports, so this is belt-and-suspenders.
  if (serverConfig.demoMode) {
    app.use("/api/demo", demoRoutes);
    console.log("[SIMULATED] DEMO_MODE=true — /api/demo/* mounted");
  } else {
    console.log("DEMO_MODE not set — /api/demo/* NOT mounted (production-shaped run).");
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled route error:", err);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
