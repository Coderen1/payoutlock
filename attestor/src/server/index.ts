import { buildApp } from "./app.ts";
import { serverConfig } from "./config.ts";
import { startBackgroundFundingSweep } from "./backgroundFundingSweep.ts";

const app = buildApp();
startBackgroundFundingSweep();
app.listen(serverConfig.port, () => {
  console.log(`PayoutLock orchestration API listening on :${serverConfig.port} (DEMO_MODE=${serverConfig.demoMode})`);
});
