module.exports = {
  preset: "ts-jest",
  setupFilesAfterEnv: ["./configuration/run_spec.js"],
  testEnvironment: "node",
  testRegex: "run_tests.js$",
  rootDir: "..",
  transform: {},
};
