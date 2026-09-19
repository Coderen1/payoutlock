import { buildApp } from "./app.ts";
import { serverConfig } from "./config.ts";
import { startBackgroundFundingSweep } from "./backgroundFundingSweep.ts";
import { startKeeper } from "./keeper.ts";

const app = buildApp();
startBackgroundFundingSweep();
startKeeper();
app.listen(serverConfig.port, () => {
  console.log(`PayoutLock orchestration API listening on :${serverConfig.port} (DEMO_MODE=${serverConfig.demoMode})`);
});
