import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["./configuration/run_spec.ts"],
  testEnvironment: "node",
  testRegex: "run_tests.js$",
  rootDir: "..",
  transform: {},
};

export default config;
