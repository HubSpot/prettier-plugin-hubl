const {
  findConfig,
  loadConfig,
  validateConfig,
  getAccountId,
  isTrackingAllowed,
  getAccountConfig,
} = require("@hubspot/cli-lib");
import { resolveConfigFile } from "prettier";

export const trackUsage = () => {
  const rootPath = resolveConfigFile.sync();
  if (!rootPath) {
    return;
  }
  console.log("rootpath", rootPath);

  const configPath = findConfig(rootPath);
  if (!configPath) {
    return;
  }
  console.log("configPath", configPath);

  loadConfig(configPath);

  if (!validateConfig()) {
    return;
  }
};
