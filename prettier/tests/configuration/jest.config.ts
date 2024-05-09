import type { Config } from "jest";

const config: Config = {
  //preset: "ts-jest",
  setupFilesAfterEnv: ["./configuration/run_spec.ts"],
  testEnvironment: "node",
  testRegex: "run_tests.js$",
  rootDir: "..",

  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    // '^.+\\.[tj]sx?$' to process js/ts with `ts-jest`
    // '^.+\\.m?[tj]sx?$' to process js/ts/mjs/mts with `ts-jest`
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
};

export default config;
