module.exports = {
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  root: true,
  env: {
    browser: false,
    node: true,
    commonjs: true,
    es6: true,
    jest: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    project: ["./prettier/tsconfig.json", "./parser/tsconfig.json"],
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "no-return-await": "error",
    "no-var": "error",
    "@typescript-eslint/ban-types": "off",
  },
};
